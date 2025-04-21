import getFolderSize from "get-folder-size";

const { Client } = require("basic-ftp");
const { exec } = require("child_process");
const path = require("path");
const fs = require("fs");
const {
  getBackupFolderPath,
  getFolders,
  getBackupsListForNotification,
  logger,
} = require("./utils");
const { sendNotification } = require("./telegram");
const disk = require("diskusage");

let backupFolderPath = null;

/** Returns a connected FTP client */
const getClient = async () => {
  try {
    const client = new Client();
    client.ftp.verbose = process.env.LOGGING_FTP === "true";

    await client.access({
      host: process.env.FTP_HOST,
      user: process.env.FTP_USER,
      password: process.env.FTP_PASS,
      secure: process.env.FTP_SECURE === "true",
    });

    return client;
  } catch (err) {
    throw new Error(`Failed to connect to FTP server: ${err.message}`);
  }
};

/** Creates a backup folder on FTP server & deletes old backups */
const beforeEach = async () => {
  logger("Creating backup folder on FTP server & deleting old backups...");
  backupFolderPath = await getBackupFolderPath();

  let backups_limit = parseInt(process.env.BACKUPS_LIMIT);
  backups_limit =
    isNaN(backups_limit) || backups_limit <= 0 ? 5 : backups_limit;

  //delete old backups
  const client = await getClient();
  try {
    let folders = await client.list();
    folders = folders.filter((item) => item.name.startsWith("backups-"));
    folders.sort((a, b) => a.name.localeCompare(b.name));

    if (folders.length >= backups_limit) {
      const toDelete = folders.slice(0, folders.length - backups_limit + 1);

      for (const folder of toDelete) {
        await client.removeDir(folder.name);
        logger(`Deleted old backup: ${folder.name}`);
      }
    }
  } catch (err) {
    throw new Error(`Failed to delete old backups: ${err.message}`);
  }

  try {
    await client.ensureDir(backupFolderPath);
    logger(`Created backup folder: ${backupFolderPath}`);
  } catch (err) {
    throw new Error(`Failed to create backup folder: ${err.message}`);
  }
};

/** Uploads a tar archive to FTP server */
const uploadArchive = async (folder) => {
  const client = await getClient();
  const archive = path.join(process.cwd(), "tmp", `${folder}.tar.zst`);
  const ftpPath = backupFolderPath + folder + ".tar.zst";

  logger(`Uploading archive: ${archive} to ${ftpPath}`);
  await client.uploadFrom(archive, ftpPath);
  client.close();

  fs.unlinkSync(archive);
  logger(`Deleted: ${archive}`);
  logger(`===> Uploaded archive ${folder} to remote ${ftpPath} <===`);
};

/** Creates a tar archive of a folder */
const copyFile = async (output, sourceDir) => {
  return new Promise((resolve, reject) => {
    const command = `rsync -ah --progress --inplace ${sourceDir} ${output}`;
    logger(`Executing command: ${command}`);

    const tarProcess = exec(command, (error, stdout, stderr) => {
      if (error) {
        console.warn(`Error: ${error.message}\n${stderr}`);
      }
      if (stderr) {
        console.warn(`Warning: ${stderr.trim()}`);
      }
      resolve(stdout.trim());
    });

    tarProcess.on("error", (error) => {
      reject(new Error(`Failed to spawn tar process: ${error.message}`));
    });
  });
};

/** Compresses a file */
const compressFile = async (output, input) => {
  return new Promise((resolve, reject) => {
    const command = input
      ? `tar -I zstd -cf ${output}.tar.zst ${input}`
      : `tar -I zstd -cf ${output}.tar.zst ${output}`;
    logger(`Executing command: ${command}`);

    const tarProcess = exec(command, (error, stdout, stderr) => {
      if (error) {
        console.warn(`Error: ${error.message}\n${stderr}`);
      }
      if (stderr) {
        console.warn(`Warning: ${stderr.trim()}`);
      }
      resolve(stdout.trim());
    });

    tarProcess.on("error", (error) => {
      reject(new Error(`Failed to spawn tar process: ${error.message}`));
    });
  });
};

/** Checks if there is enough space on the disk */
const isEnoughSpace = async (source) => {
  const { free } = await disk.check("/");
  let size = 0;

  try {
    size = await getFolderSize.loose(source);
  } catch (err) {
    logger(`Failed to get folder size: ${err.message}`);
  }

  logger(
    `Free space: ${(free / 1024 / 1024 / 1024).toFixed(2)} GB, Folder size: ${(
      size /
      1024 /
      1024 /
      1024
    ).toFixed(2)} GB`
  );

  if (free < size * 2) {
    return false;
  } else {
    return true;
  }
};

/** Archives and uploads a folder */
const archiveAndUpload = async (folder) => {
  const sourceDir = path.join(process.env.SOURCE_DIR, folder);
  const output = path.join(process.cwd(), "tmp", folder);
  logger("");
  logger(`===> Processing: ${folder} <===`);
  logger(`Source: ${sourceDir}`);
  logger(`Output: ${output}`);

  try {
    if (!(await isEnoughSpace(sourceDir))) {
      sendNotification(
        `☑️ [${process.env.NODE_NAME}] Not enough space to backup: ${folder}`
      );
      logger(`Not enough space to backup: ${folder}`);
      return;
    }
  } catch (err) {
    throw new Error(`Failed to check space: ${err.message}`);
  }

  try {
    if (process.env.COPY_BEFORE_BACKUP === "true") {
      await copyFile(output, sourceDir);
      logger(`Copied ${sourceDir} to ${output}`);
    }
  } catch (err) {
    throw new Error(
      `Failed to create archive for file: ${folder}. ${err.message}`
    );
  }

  try {
    await compressFile(
      output,
      process.env.COPY_BEFORE_BACKUP === "true" ? null : sourceDir
    );
    logger(`Compressed archive: ${output}`);

    if (process.env.COPY_BEFORE_BACKUP === "true") {
      fs.unlinkSync(output);
      logger(`Deleted: ${output}`);
    }
  } catch (err) {
    throw new Error(
      `Failed to compress archive for file: ${folder}. ${err.message}`
    );
  }

  try {
    await uploadArchive(folder);
    logger("");
  } catch (err) {
    throw new Error(
      `Failed to upload archive for file: ${folder}. ${err.message}`
    );
  }
};

/** Backups all folders */
const backupFolders = async () => {
  const foldersToBackup = await getFolders();

  if (foldersToBackup.length === 0) {
    if (process.env.ONLY_ON_ERROR !== "true")
      sendNotification(
        `✅ [${process.env.NODE_NAME}] Backups done (no folders to backup)`
      );
    return;
  }

  for await (const folder of foldersToBackup) {
    await archiveAndUpload(folder);
  }

  const backupsList = await getBackupsListForNotification(foldersToBackup);
  if (process.env.ONLY_ON_ERROR !== "true")
    sendNotification(
      `✅ [${process.env.NODE_NAME}] Backups done:\n ${backupsList}`
    );
  logger("Backups done");
};

module.exports = {
  beforeEach,
  backupFolders,
};

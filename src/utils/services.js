const { Client } = require("basic-ftp");
const { exec } = require("child_process");
const path = require("path");
const fs = require("fs");
const { getBackupFolderPath, getFolders } = require("./utils");
const { sendNotification } = require("./telegram");

let backupFolderPath = null;
let client = null;

/** Returns a connected FTP client */
const getClient = async () => {
  try {
    if (!client) {
      client = new Client();
      client.ftp.verbose = process.env.LOGGING === "true";

      await client.access({
        host: process.env.FTP_HOST,
        user: process.env.FTP_USER,
        password: process.env.FTP_PASS,
        secure: process.env.FTP_SECURE === "true",
      });
    }

    return client;
  } catch (err) {
    throw new Error(`Failed to connect to FTP server: ${err.message}`);
  }
};

/** Creates a backup folder on FTP server & deletes old backups */
const beforeEach = async () => {
  backupFolderPath = await getBackupFolderPath();

  let backups_limit = parseInt(process.env.BACKUPS_LIMIT);
  backups_limit = isNaN(backups_limit) || backups_limit <= 0 ? 5 : backups_limit;

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
      }
    }
  } catch (err) {
    throw new Error(`Failed to delete old backups: ${err.message}`);
  }

  try {
    await client.ensureDir(backupFolderPath);
  } catch (err) {
    throw new Error(`Failed to create backup folder: ${err.message}`);
  }
};

/** Uploads a tar archive to FTP server */
const uploadArchive = async (folder) => {
  const client = await getClient();
  const archive = path.join(process.cwd(), "tmp", `${folder}.tar.gz`);
  const ftpPath = backupFolderPath + folder + ".tar.gz";

  await client.uploadFrom(archive, ftpPath);

  fs.unlinkSync(archive);
};

/** Creates a tar archive of a folder */
const createTar = async (output, sourceDir) => {
  return new Promise((resolve, reject) => {
    const command = `tar -cf ${output} -C ${sourceDir} .`;

    const tarProcess = exec(command, (error, stdout, stderr) => {
      if (error) {
        return reject(new Error(`Error: ${error.message}\n${stderr}`));
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

/** Archives and uploads a folder */
const archiveAndUpload = async (folder) => {
  const sourceDir = path.join(process.env.SOURCE_DIR, folder);
  const output = path.join(process.cwd(), "tmp", `${folder}.tar.gz`);

  try {
    await createTar(output, sourceDir);
    console.log(`Archive created for folder: ${folder}`);
  } catch (err) {
    throw new Error(`Failed to create archive for folder: ${folder}. ${err.message}`);
  }

  try {
    await uploadArchive(folder);
    console.log(`Uploaded archive for folder: ${folder}`);
  } catch (err) {
    throw new Error(`Failed to upload archive for folder: ${folder}. ${err.message}`);
  }
};

/** Backups all folders */
const backupFolders = async () => {
  const foldersToBackup = await getFolders();

  if (foldersToBackup.length === 0) {
    sendNotification("✅ Backups done (no folders to backup)");
    return;
  }

  for (const folder of foldersToBackup) {
    await archiveAndUpload(folder);
  }

  try {
    const client = await getClient();
    await client.close();
  } catch (err) {
    console.error(`Failed to close FTP connection: ${err.message}`);
  }

  sendNotification(`✅ Backups done (backuped ${foldersToBackup.length} folders)`);
};

module.exports = {
  beforeEach,
  backupFolders,
};

const { Client } = require("basic-ftp");
const tar = require("tar");
const path = require("path");
const fs = require("fs");
const { syncTmpFolder, getBackupFolderPath, getFolders } = require("./utils");

const beforeEach = async () => {
  global.majorcore_backupFolderPath = getBackupFolderPath();
  syncTmpFolder();

  let backups_limit = parseInt(process.env.BACKUPS_LIMIT);
  backups_limit =
    isNaN(backups_limit) || backups_limit <= 0 ? 5 : backups_limit;

  const client = new Client();
  client.ftp.verbose = process.env.LOGGING === "true";

  await client.access({
    host: process.env.FTP_HOST,
    user: process.env.FTP_USER,
    password: process.env.FTP_PASS,
    secure: process.env.FTP_SECURE === "true",
  });

  //delete old backups
  let folders = await client.list();
  folders = folders.filter((item) => item.name.startsWith("servers-"));
  folders.sort((a, b) => a.name.localeCompare(b.name));

  if (folders.length >= backups_limit) {
    const toDelete = folders.slice(0, folders.length - backups_limit + 1);
    for (const folder of toDelete) {
      await client.removeDir(folder.name);
    }
  }

  //create new folder for backup
  await client.ensureDir(global.majorcore_backupFolderPath);

  client.close();
};

const uploadArchive = async (folder) => {
  const client = new Client();
  client.ftp.verbose = process.env.LOGGING === "true";

  await client.access({
    host: process.env.FTP_HOST,
    user: process.env.FTP_USER,
    password: process.env.FTP_PASS,
    secure: process.env.FTP_SECURE === "true",
  });

  const archive = path.join(process.cwd(), "tmp", `${folder}.tar.gz`);
  const ftpPath = global.majorcore_backupFolderPath + folder + ".tar.gz";

  await client.uploadFrom(archive, ftpPath);
  console.log(`Uploaded archive for folder: ${folder}`);

  client.close();

  fs.unlinkSync(archive);
};

const archiveAndUpload = async (folder) => {
  if (!process.env.SOURCE_DIR) {
    throw new Error("SOURCE_DIR is not set");
  }

  const sourceDir = path.join(process.env.SOURCE_DIR, folder);
  const output = path.join(process.cwd(), "tmp", `${folder}.tar.gz`);

  try {
    await tar.create(
      {
        gzip: true,
        file: output,
        cwd: sourceDir,
        onwarn: (message, data) => {
          if (data.code === "ENOENT") {
            console.warn(`Warning: Skipping missing file - ${data.path}`);
          } else {
            console.warn(message);
          }
        },
      },
      ["."]
    );
  } catch (error) {
    console.error(`Error creating archive: ${error}`);
  }

  console.log(`Archive created for folder: ${folder}`);

  await uploadArchive(folder);
};

const backupFolders = async () => {
  const foldersToBackup = await getFolders();

  if (foldersToBackup.length === 0) {
    return;
  }

  for (const folder of foldersToBackup) {
    await archiveAndUpload(folder);
  }
};

module.exports = {
  beforeEach,
  backupFolders,
};

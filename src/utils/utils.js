const fs = require("fs").promises;
const { exec } = require("child_process");
const path = require("path");

/** Generates a remote folder name for backups & creates a local TMP folder */
const getBackupFolderPath = async () => {
  const date = new Date();
  let month = date.getMonth() + 1;
  month = month < 10 ? `0${month}` : month;
  let day = date.getDate();
  day = day < 10 ? `0${day}` : day;

  const folderName = `/backups-${date.getFullYear()}-${month}-${day}/`;

  const tmpFolder = path.join(process.cwd(), "tmp");
  try {
    await fs.access(tmpFolder);
  } catch (e) {
    await fs.mkdir(tmpFolder);
  }

  return folderName;
};

/** Returns a list of folders that needs to be backuped */
const getFolders = async () => {
  const sourceDir = process.env.SOURCE_DIR;

  if (!sourceDir) {
    throw new Error("SOURCE_DIR is not set");
  }

  const files = await fs.readdir(sourceDir, { withFileTypes: true });
  const directories = files.filter((dirent) => dirent.isDirectory() && !dirent.name.startsWith(".")).map((dirent) => dirent.name);

  return directories;
};

const getBackupsListForNotification = async (folders) => {
  const path = process.env.SOURCE_DIR;
  let foldersPaths = "";

  if (!Array.isArray(folders) || folders.length === 0) {
    foldersPaths = `${path}/*`;
  } else {
    folders.forEach((folder) => {
      foldersPaths += `${path}/${folder} `;
    });
  }

  return new Promise((resolve) => {
    exec(`du -sh ${foldersPaths}`, (error, stdout, stderr) => {
      if (error) {
        return resolve("....failed to get backups list....");
      }

      resolve(stdout.trim().replaceAll(path + "/", "")); // Return the raw output
    });
  });
};

module.exports = {
  getBackupFolderPath,
  getFolders,
  getBackupsListForNotification,
};

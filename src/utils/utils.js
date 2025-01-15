const fs = require("fs").promises;
const fsSync = require("fs");
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
  const directories = files.filter((dirent) => !dirent.name.startsWith(".")).map((dirent) => dirent.name);
  logger(`Folders to backup: ${directories.join(", ")}`);

  return directories;
};

/** Returns a list of backups (with sizes in GB) for notification */
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

/** Empties the log file if it's more than 1GB */
const emptyLogFile = () => {
  const logFile = path.join(process.cwd(), "backup.log");
  const stats = fsSync.statSync(logFile);
  const fileSizeInBytes = stats.size;
  const fileSizeInMegabytes = fileSizeInBytes / (1024 * 1024);

  if (fileSizeInMegabytes > 1024) {
    fsSync.writeFileSync(logFile, "");
  }
};

const logger = (msg) => {
  if (process.env.LOGGING === "true") {
    console.log(msg);
  }

  // writing to the log file
  const path = path.join(process.cwd(), "backup.log");
  fsSync.appendFile(path, `${new Date().toISOString()} - ${msg}\n`, (err) => {
    if (err) {
      console.error("Failed to write to log file");
    }
  });
};

module.exports = {
  getBackupFolderPath,
  getFolders,
  getBackupsListForNotification,
  logger,
  emptyLogFile
};

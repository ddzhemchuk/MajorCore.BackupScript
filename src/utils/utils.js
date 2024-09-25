const fs = require("fs").promises;
const path = require("path");

const getBackupFolderPath = () => {
  const date = new Date();
  let month = date.getMonth() + 1;
  month = month < 10 ? `0${month}` : month;
  let day = date.getDate();
  day = day < 10 ? `0${day}` : day;

  const folderName = `/servers-${date.getFullYear()}-${month}-${day}/`;

  return folderName;
};

const getFolders = async () => {
  const sourceDir = process.env.SOURCE_DIR;

  if (!sourceDir) {
    throw new Error("SOURCE_DIR is not set");
  }

  const files = await fs.readdir(sourceDir, { withFileTypes: true });
  const directories = files
    .filter((dirent) => dirent.isDirectory() && !dirent.name.startsWith("."))
    .map((dirent) => dirent.name);

  return directories;
};

const syncTmpFolder = async () => {
  const tmpFolder = path.join(process.cwd(), "tmp");

  try {
    await fs.access(tmpFolder);
  } catch (e) {
    await fs.mkdir(tmpFolder);
  }
};

module.exports = {
  getBackupFolderPath,
  getFolders,
  syncTmpFolder,
};

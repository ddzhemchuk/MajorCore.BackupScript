require("dotenv").config();
const { beforeEach, backupFolders } = require("./utils/services");
const { sendNotification } = require("./utils/telegram");
const { emptyLogFile } = require("./utils/utils");

(async () => {
  try {
    emptyLogFile();
    await beforeEach();
    await backupFolders();
    process.exit(0);
  } catch (e) {
    await sendNotification(e);
    process.exit(1);
  }
})();

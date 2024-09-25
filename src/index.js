require("dotenv").config();
const { beforeEach, backupFolders } = require("./utils/services");
const { sendNotification } = require("./utils/telegram");

(async () => {
  try {
    await beforeEach();
    await backupFolders();
  } catch (e) {
    console.error(e);

    if (process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID) {
      sendNotification(JSON.stringify(e));
    }
  }
})();

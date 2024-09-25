const sendNotification = async (message) => {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    console.error("Telegram bot token or chat id not provided");
  }

  message = `Error while creating backup on node ${process.env.FTP_USER?.toUpperCase()}. Logs: ${message}`;

  try {
    await fetch(
      `https://api.telegram.org/${token}/sendMessage?chat_id=${chatId}&chat_type=private&text=${message}&parse_mode=Markdown`
    );
  } catch (err) {
    console.error(err);
  }

  process.exit(1);
};

module.exports = {
  sendNotification,
};

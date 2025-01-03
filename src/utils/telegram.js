const sendNotification = async (msg) => {
  let notify = false;

  if (msg instanceof Error) {
    console.error(msg);
    notify = true;
    msg = `❌ [${process.env.NODE_NAME}] Backups error. Logs: ${msg.message}`;
  }

  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    console.warn("Telegram bot token or chat id not provided");
    return;
  }

  try {
    await fetch(`https://api.telegram.org/${token}/sendMessage`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        chat_id: chatId,
        text: msg,
        parse_mode: "HTML",
        disable_notification: !notify,
      }),
    });
  } catch (err) {
    console.error(err);
  }
};

module.exports = {
  sendNotification,
};

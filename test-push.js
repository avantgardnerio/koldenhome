console.log("start");
try {
  const { initPush, notify } = await import("./lib/notify.js");
  console.log("module loaded");
  await initPush();
  console.log("vapid ready");
  await notify({ title: "Test", body: "Push notifications working!" });
  console.log("sent");
} catch (e) {
  console.error("ERROR:", e);
}
process.exit(0);

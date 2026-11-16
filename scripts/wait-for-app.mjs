const deadline = Date.now() + 120000;
while (Date.now() < deadline) {
  try {
    const response = await fetch("https://roast-toast-1juf.onrender.com/api/v1/health");
    const health = await response.json();
    if (response.ok && health.status === "ok") {
      console.log("Application is ready.");
      process.exit(0);
    }
  } catch {}
  await new Promise((resolve) => setTimeout(resolve, 1000));
}
throw new Error("Application did not become ready within two minutes.");

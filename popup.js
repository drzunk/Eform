const statusDiv = document.getElementById('status');
const loader = document.getElementById('loader');
const fillBtn = document.getElementById('fillBtn');

function showStatus(msg, isError) {
  statusDiv.textContent = msg;
  statusDiv.style.color = isError ? "red" : "green";
  loader.style.display = "none";
  fillBtn.disabled = false;
}

document.getElementById('fillBtn').addEventListener('click', async () => {
  fillBtn.disabled = true;
  loader.style.display = "block";
  statusDiv.textContent = "Đang kết nối Backend...";
  statusDiv.style.color = "#555";
  
  try {
    let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    // Bóc tách formId từ URL (Giả sử ID nằm ở cuối URL sau dấu /)
    const urlParts = tab.url.split('/');
    const formId = urlParts[urlParts.length - 1].split('?')[0]; 
    
    // Gọi Backend Python ở Local
    const response = await fetch(`http://localhost:5000/api/data?formId=${formId}`);
    if (!response.ok) {
      throw new Error("Backend không phản hồi. Bạn đã chạy server.py chưa?");
    }
    
    const config = await response.json();
    if (config.error) {
      throw new Error(config.error);
    }
    
    statusDiv.textContent = "Đã lấy cấu hình thành công! Đang điền...";
    
    // Gửi cấu hình xuống content script để điền form
    chrome.tabs.sendMessage(tab.id, { action: "fillForm", config: config }, function(res) {
      if (chrome.runtime.lastError) {
        showStatus("Lỗi kết nối trang web. Hãy thử tải lại trang web này (F5).", true);
      } else {
        showStatus(`Hoàn tất! Đã điền ${res.filled} trường.`, false);
      }
    });
  } catch (error) {
    showStatus(`Lỗi: ${error.message}`, true);
  }
});

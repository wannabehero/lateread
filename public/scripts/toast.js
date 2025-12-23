// Simple toast notification system
function showToast(message, type = "info") {
  // Create toast container if it doesn't exist
  let container = document.getElementById("toast-container");
  if (!container) {
    container = document.createElement("div");
    container.id = "toast-container";
    document.body.appendChild(container);
  }

  // Create toast element
  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.textContent = message;

  // Add to container
  container.appendChild(toast);

  // Trigger animation
  setTimeout(() => {
    toast.classList.add("toast-show");
  }, 10);

  // Remove after 3 seconds
  setTimeout(() => {
    toast.classList.remove("toast-show");
    setTimeout(() => {
      toast.remove();
    }, 300);
  }, 5000);
}

// Listen for successful HTMX requests and show appropriate toasts
document.body.addEventListener("htmx:afterOnLoad", (event) => {
  const xhr = event.detail.xhr;

  // Check for success header from the server
  const successMessage = xhr.getResponseHeader("X-Toast-Message");
  if (successMessage) {
    showToast(successMessage, "success");
  }

  // Auto-detect successful actions based on status codes
  if (xhr.status === 200 || xhr.status === 204) {
    const url = event.detail.pathInfo.requestPath;

    if (url.includes("/archive")) {
      showToast("Article archived successfully", "success");
    } else if (url.includes("/read")) {
      // Don't show toast for auto-mark-as-read
    }
  }
});

function shareArticle(element) {
  const url = element.dataset.url;
  const title = element.dataset.title || "";

  if (navigator.share) {
    navigator
      .share({
        title: title,
        url: url,
      })
      .catch(() => {
        // User cancelled or share failed - silently ignore
      });
  } else {
    copyToClipboard(url);
  }
}

function copyToClipboard(url) {
  navigator.clipboard
    .writeText(url)
    .then(() => {
      showToast("Link copied to clipboard", "success");
    })
    .catch(() => {
      showToast("Failed to copy link", "error");
    });
}

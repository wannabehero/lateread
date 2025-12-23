// HTMX Error Handling
document.body.addEventListener("htmx:responseError", (event) => {
  const statusCode = event.detail.xhr.status;
  const target = event.detail.target;

  let errorMessage = "An error occurred. Please try again.";

  if (statusCode === 404) {
    errorMessage = "Resource not found.";
  } else if (statusCode === 401 || statusCode === 403) {
    errorMessage = "Unauthorized. Please log in again.";
    // Redirect to login after a short delay
    setTimeout(() => {
      window.location.href = "/";
    }, 2000);
  } else if (statusCode === 500) {
    errorMessage = "Server error. Please try again later.";
  } else if (statusCode === 0) {
    errorMessage = "Network error. Please check your connection.";
  }

  // Create error message HTML
  const errorHTML = `<div class="error"><p>${errorMessage}</p></div>`;

  // Insert error message into the target element
  if (target) {
    target.innerHTML = errorHTML;
  }
});

// Handle timeouts
document.body.addEventListener("htmx:timeout", (event) => {
  const target = event.detail.target;
  const errorHTML =
    '<div class="error"><p>Request timed out. Please try again.</p></div>';

  if (target) {
    target.innerHTML = errorHTML;
  }
});

// Handle send errors (network failures)
document.body.addEventListener("htmx:sendError", (event) => {
  const target = event.detail.target;
  const errorHTML =
    '<div class="error"><p>Network error. Please check your connection.</p></div>';

  if (target) {
    target.innerHTML = errorHTML;
  }
});

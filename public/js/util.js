/* Tiện ích dùng chung. Nạp đầu tiên, trước mọi file khác. */

// Thoát ký tự HTML. BẮT BUỘC dùng cho mọi dữ liệu do người dùng nhập khi ghép vào innerHTML.
window.esc = function (value) {
  return String(value == null ? '' : value).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
};

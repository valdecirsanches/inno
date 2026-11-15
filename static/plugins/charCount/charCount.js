$('.charCount').keyup(function() {
  var length = $(this).val().length;
  length = $(this).prop("maxlength")-length;
  $(this).parent().find('h5 span').text(length);
});
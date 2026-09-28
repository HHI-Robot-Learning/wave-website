// Nerfies page behavior: result carousel (the interpolation slider of the original is not used).
document.addEventListener('DOMContentLoaded', function () {
  bulmaCarousel.attach('.carousel', {
    slidesToScroll: 1,
    slidesToShow: 3,
    loop: true,
    infinite: true,
    autoplay: false,
    autoplaySpeed: 3000,
  });
});

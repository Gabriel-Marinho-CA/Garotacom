var bannerAdded = false;
function drawerDisplay () {
    try {
      const cartDrawerBackground = document.getElementById('wizz4-cart-drawer-background');
      const cartDrawer = document.getElementById('wizz4-cart-drawer');
      if (
        cartDrawer &&
        cartDrawerBackground &&
        !cartDrawer.className.includes('visible')
      ) {
        document.body.classList.add('no-scroll');
        cartDrawerBackground.classList.add('wizz4-visible');
        cartDrawer.classList.add('wizz4-visible');
        fetch(
          `/apps/cart-agapi?action=cart&cartId=${ Window.snapCart.cartConfig.id }`
        );
      }

      if(!bannerAdded){
        const promoBanner = $('.promo-banner').clone();
        promoBanner.removeClass('d-none');
        console.log('tracked promoBanner', promoBanner);
        setTimeout(() => $('.wizz-announcement-custom').prepend(promoBanner.html()), 1000);
        bannerAdded = true;
      }

      //.wizz-discount-code-wrapper parent > parent
      //.wizz-shipping-rate-wrapper
      ;

      const movingDiv = $('.wizz-discount-code-wrapper').parent().parent();
      const newParent = $('.wizz-shipping-rate-wrapper');
      // Move the div to the new parent
      newParent.append(movingDiv);
      
      $('.wizz-trustbagde-wrapper').removeClass('w4-overflow-hidden');

    } catch (error) {
      console.log({
        error
      });
    }
  };

/*  O script copia o cart drawer do snapcart e o adiciona ao mdev-cart
  Daí faz algumas alterações para que o cart drawer funcione corretamente
*/

function copyCartDrawer(){
    setTimeout(() => {
        // Get references to the elements
        const movingDiv = document.getElementById('w4root');
        if(w4root.length == 0){
            console.info('#w4root not found');
            return;
        }
        $('#mdev-cart #m4root #wizz4-cart-drawer').removeAttr('style');
        $('.loading-gif').remove();
        const newParent = document.getElementById('mdev-cart');
        // Move the div to the new parent
        newParent.appendChild(movingDiv);
        console.info('snapcart copied');
        $('#w4-cart-a').remove();
        $('.wizz-header-icon-custom').remove();
        $('.wizz-trustbagde-wrapper').removeClass('w4-overflow-hidden');
        // hide cart icon on cart page
        $('.cart').remove();
    }, 3000);
}


function addCarButtonListeners(){
  let targetWrapper = $('.menu_moblie').is(':hidden') ? null : $('.menu_moblie');
    //targetWrapper = $('.menu_toolbar').is(':hidden') ? targetWrapper : $('.menu_toolbar');
    targetWrapper = $('#header').is(':hidden') ? targetWrapper : $('#header');

    console.log('tracked targetWrapper', targetWrapper, targetWrapper.find('a.cart'));
    targetWrapper.find('a.cart').on('click', function(){
        drawerDisplay();
    });
    targetWrapper.find('a.cart').removeAttr('href');
    targetWrapper.find('a.cart').removeClass('js-call-minicart');
}


(function($){
  $(document).ready(function() {
    //once on load
    addCarButtonListeners();

    window.addEventListener('resize', function(event) {
       //once on resize, to track te correct targetWrapper
      addCarButtonListeners();
  }, true);

    console.info('jq ready');

    //only for the new cart page v2
    if($('.page-cart-v2').length > 0){
        copyCartDrawer();
    }
 
});
})(jQuery);
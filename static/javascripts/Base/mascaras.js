var SPMaskBehavior = function (val) {
    return val.replace(/\D/g, '').length === 11 ? '(00) 00000-0000' : '(00) 0000-00009';
},
spOptions = {
    onKeyPress: function(val, e, field, options) {
        field.mask(SPMaskBehavior.apply({}, arguments), options);
    }
};




//
// $('.celular').mask(SPMaskBehavior, spOptions);
//
$('.cep').mask('99999-999');
//
$('.rg').mask('99.999.999-A');
//
$('.rg_emissor').mask('SSS-SS');
//
$('.cpf').mask('999.999.999-99');
//
$('.cnpj').mask('99.999.999/9999-99');
//
$('.money').mask('#.##0,99', {reverse: true});
//
$('.ano').mask('9999');
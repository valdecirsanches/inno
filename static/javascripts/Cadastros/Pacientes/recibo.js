
var $tableRecibos = $('#tabelaRecibos');

var $selecionaMedicoRecibo = $('.classRecibo #id_fk_medico').selectize({
    // a lista abre direto no <body>, por cima da janela: dentro do formulário
    // ela ficava cortada e os últimos médicos não podiam ser escolhidos
    dropdownParent: 'body',
    dropdownClass: 'selectize-dropdown recibo-medico-lista',
    valueField: 'id',
    labelField: 'descricao',
    searchField: 'descricao',
    options: [],
    create: false,
    render: {
        option: function(item, escape) {
            return  '<div class="media-body">' +
                '<div class="col-sm-2">' + escape(item.id) + '</div>' +
                '<div class="col-sm-10"><strong class="media-heading">' + escape(item.descricao) + '</strong></div>' +
                '</div>';
        }
    }
});

var selecionaMedicoRecibo = $selecionaMedicoRecibo[0].selectize;
selecionaMedicoRecibo.load(function(callback) {
    $.ajax({
        url: '/cadastros/medicos/SelecionaMedico',
        method: 'GET',
    }).success(function Ret(data){
        callback(data);
    });
});


function ReciboConsulta(){
    var id_paciente = $('.classPaciente #id_id').val();
    $tableRecibos.bootstrapTable('refresh', {query: {paciente: id_paciente}});
}

function NovoRecibo(){
    ChangeIdRecibo(0);
    $.ajax({
        url: '/cadastros/paciente/NovoRecibo',
        data:{
            paciente:$('.classPaciente #id_id').val()
        },
        method: 'GET',
    }).success(function Ret(data){
        $('.classRecibo #id_fk_paciente').val(data.success.fk_paciente);
        $('.classRecibo #id_codigo').val(data.success.codigo);
        $('.classRecibo #id_fk_usuario').val(data.success.fk_usuario);
        // "Emitido por": mostra quem está incluindo o recibo
        $('.classRecibo #id_usuario').val(data.success.usuario || '');
        $('.classRecibo #id_fk_paciente').val($('#id_id').val());
        $('.classRecibo #id_paciente_nome').val($('#id_paciente').val());
        $('.classRecibo #id_valor').focus();
    });
}

function CarregaRecibo(value){
    $.ajax({
        url: '/cadastros/paciente/CarregaRecibo',
        data: {
            'recibo': value
        },
        method: 'GET',
    }).success(function Ret(data){
        if(data.success){
            $('.classRecibo #id_id').val(data.success.id);
            $('.classRecibo #id_valor').val(data.success.valor);
            $('.classRecibo #id_valor_extenso').val(data.success.valor_extenso);
            // $('.classRecibo #id_usuario').val('Usuario: '+data.success.fields.id_usuario);
            ChangeIdRecibo(data.success.id);
            for (var key in data.success.fields) {
                if (data.success.fields.hasOwnProperty(key)) {
                    if (data.success.fields[key]==='None') { $('.classRecibo #'+key).val('');}
                    else { $('.classRecibo #'+key).val(data.success.fields[key]);}
                }
            }
            $('.classRecibo #id_paciente_nome').val(data.success.pac);
            selecionaMedicoRecibo.setValue(data.success.fields['id_fk_medico']);
        } else {
            toastr.error('Erro', "Impossivel Carregar recibo");
        }
    });
}

function ReplaceValor(value){
    value = value.replace(',', '.');
    return value;
}

function SupraValor(valor){
    valor = ReplaceValor(valor);
    $.ajax({
        url: '/cadastros/paciente/SupraValor',
        data: {
            'valor': valor
        },
        method: 'GET',
    }).success(function Ret(data){
        if (data.success){
            $('.classRecibo #id_valor_extenso').val(data.success.extenso);
        } else {
            toastr.error('', 'Erro');
        }
    });
    return valor;
}


// Trava contra cliques repetidos no "Salvar" do recibo.
// O botão #salvarRecibo é um <a>, e links não têm a propriedade "disabled":
// o $btn.prop('disabled', true) abaixo não impede novos cliques. Sem esta
// trava, cada clique rápido enviava um POST com recibo=0 e o servidor criava
// um recibo novo para cada um.
var salvandoRecibo = false;

function SalvaRecibo() {

    if (salvandoRecibo) {
        return;
    }
    salvandoRecibo = true;

    // o id do botão no HTML é "salvarRecibo" (antes estava "salvaRecibo",
    // que não existe, e o "Salvando..." nunca aparecia)
    const $btn = $('#salvarRecibo');
    const textoOriginal = $btn.html();

    // 🔒 Desativa botão e mostra spinner
    $btn.prop('disabled', true)
        .html('<i class="fa fa-spinner fa-spin"></i> Salvando...');

    $.ajax({
        url: '/cadastros/paciente/SalvaRecibo/',
        data: {
            form: $('.classRecibo').serialize(),
            recibo: $('.classRecibo #id_id').val(),
            paciente: $('.classPaciente #id_id').val(),
            valor: $('.classRecibo #id_valor').val(),
        },
        method: 'POST',
    })
    .done(function (data) {

        if (data.success) {

            $('.form-group')
                .removeClass('has-error')
                .addClass('has-success');

            $('.classRecibo #id_id').val(data.success.id);
            $('.classRecibo #id_valor_extenso').val(data.success.extenso);

            ChangeIdRecibo(data.success.id);
            ReciboConsulta();

            toastr.success(
                'Dados salvos com sucesso!',
                'Recibo atualizado.'
            );

        } else if (data.error) {

            $('.form-group').removeClass('has-error');

            for (var i = 0; i < data.error.length; i++) {
                $('.classRecibo #id_' + data.error[i] + '_div')
                    .addClass('has-error');
            }

            toastr.error(
                'Erro na validação dos dados, verifique os campos em vermelho!',
                'Dados não salvos!'
            );

        } else {
            toastr.error('Dados não salvos', 'Erro inesperado');
        }

    })
    .fail(function () {
        toastr.error(
            'Erro ao comunicar com o servidor.',
            'Falha inesperada!'
        );
    })
    .always(function () {
        // 🔓 Restaura botão
        salvandoRecibo = false;
        $btn.prop('disabled', false)
            .html(textoOriginal);
    });

}


function ImprimeRecibo(){
    printPDF('ImprimeRecibo?id='+$('.classRecibo #id_id').val());
}

function ChangeIdRecibo(id_recibo){
    $('.classRecibo #formRecibo.form-group').removeClass('has-error').removeClass('has-success');
    if (typeof id_recibo === 'undefined'){
        LimpaCamposRecibo();
        DesabilitaCamposRecibo();
        DesabilitaBotoesRecibo();
    } else {
        HabilitaCamposRecibo();
        HabilitaBotoesRecibo();
        if (id_recibo === 0){
            LimpaCamposRecibo();
            $('#imprimirRecibo').addClass('disabled');
        }
    }
}


/* Inicio BootstrapTable Recibo */



$tableRecibos.on('dbl-click-row.bs.table', function (e, row) {
    CarregaRecibo(row.id);
});
/* Fim BootstrapTable Recibo */


var camposRecibo = '.classRecibo input, .classRecibo textarea';

function HabilitaBotoesRecibo(){
    $('#salvarRecibo').removeClass('disabled');
    $('#imprimirRecibo').removeClass('disabled');
}

function DesabilitaBotoesRecibo(){
    $('#salvarRecibo').addClass('disabled');
    $('#imprimirRecibo').addClass('disabled');
}

function DesabilitaCamposRecibo(){
    $(camposRecibo).prop('disabled', true);
    selecionaMedicoRecibo.disable();
}

function LimpaCamposRecibo(){
    $(camposRecibo).val('');
    selecionaMedicoRecibo.clear();
    $('.classRecibo #id_id').val('0');
    $('.classRecibo #id_emissao').val(date);
    $('.classRecibo #id_data_recibo').val(date);
}

function HabilitaCamposRecibo(){
    $(camposRecibo).prop('disabled', false);
    selecionaMedicoRecibo.enable();
}

/* Recibo */

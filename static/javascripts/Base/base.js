/**
 * Created by Diego on 27/07/15.
 */

function formChanged(form) {
    var initialState = form.serialize();

    form.submit(function (e) {
      if (initialState === form.serialize()) {
        console.log('Form is unchanged!');
        return false;
      } else {
        console.log('Form has changed!');
        return true;
      }
      e.preventDefault();
    });
}

async function Processar(id1,id2){
    await $.ajax({
        url: '/whatsapp/WhatsappProcessaMessage',
        data: {id1: id1, id2: id2},
    }).success(function ret(data) {
        if (data.success === 'FEITO') {
            toastr.success('Feito');
            $tableAgenda.bootstrapTable('refresh');
        }
    }).error(function(e) {
        toastr.error(e.response.data, 'Erro');
    });
}


function Release() {
    alert($('#id_release').val())
    // api.post('restrito/usuario/permissoes/').then((response)=>{
    // permissoes = response.data;
// });
}

// let permissoes;
// api.get('restrito/usuario/permissoes/').then((response)=>{
//     permissoes = response.data;
// });


// api.get('adm/mensagem/leitura/').then((response)=>{
//     if(response.data.msgs.length) {
//         var d = new Date(response.data.msgs[0].data);
//         $('#id_data_mensagem').html(d.toLocaleDateString()+ ' '+d.toLocaleTimeString());
//         $('#id_mensagem').html(response.data.msgs[0].mensagem);
//         $('#MensagemModal').modal('show');
//
//         api.patch(`adm/mensagem/${response.data.msgs[0].id}/msg_lido/`);
//
//     }
// });


function strzero(num, size) {
    const s = "000000000" + num;
    return s.substr(s.length-size);
}



function get(path, params) {
    // The rest of this code assumes you are not using a library.
    // It can be made less wordy if you use one.
    var form = document.createElement("form");
    form.setAttribute("method", "get");
    form.setAttribute("action", path);
    var hiddenField;
    for(var key in params) {
        if(params.hasOwnProperty(key)) {
            hiddenField = document.createElement("input");
            hiddenField.setAttribute("type", "hidden");
            hiddenField.setAttribute("name", key);
            hiddenField.setAttribute("value", params[key]);

            form.appendChild(hiddenField);
         }
    }

    document.body.appendChild(form);
    form.submit();
}


var d = new Date();
var hora = strzero(d.getHours(),2),
    minutos = strzero(d.getMinutes(),2);
    date = d.getFullYear()+'-'+strzero(d.getMonth()+1,2)+'-'+strzero(d.getDate(),2);

function hoje(){
    var d = new Date();
    return d.getFullYear()+'-'+strzero(d.getMonth()+1,2)+'-'+strzero(d.getDate(),2);
}

function agora(){
    var d = new Date();
    return d.getFullYear()+'-'+strzero(d.getMonth()+1,2)+'-'+strzero(d.getDate(),2)+' '+
        strzero(d.getHours(),2)+':'+strzero(d.getMinutes(),2)+':'+strzero(d.getSeconds(),2);
}


$(function() {
    $('.text-uppercase').blur(function() {
        this.value = this.value.toLocaleUpperCase();
    });
});

function currencyFormatted(value, str_cifrao='') {
    let r;
    try {
        r = `${str_cifrao} ${value.formatMoney(2, ',', '.')}`;
    } catch {
        r = `${str_cifrao} 0,00`;
    }
    return r;
}

Number.prototype.formatMoney = function (c, d, t) {
    var n = this,
        c = isNaN(c = Math.abs(c)) ? 2 : c,
        d = d == undefined ? "," : d,
        t = t == undefined ? "." : t,
        s = n < 0 ? "-" : "",
        i = parseInt(n = Math.abs(+n || 0).toFixed(c)) + "",
        j = (j = i.length) > 3 ? j % 3 : 0;
    return s + (j ? i.substr(0, j) + t : "") + i.substr(j).replace(/(\d{3})(?=\d)/g, "$1" + t) + (c ? d + Math.abs(n - i).toFixed(c).slice(2) : "");
};


function addMonth(d, m){
    const date = new Date(d);
    const month = date.getMonth();
    const n_date = new Date(date.getFullYear(), eval(m+month), date.getDate());
    return n_date
}

function getContextMenuRow($table, $this) {
    return JSON.parse(JSON.stringify($table.bootstrapTable('getRowByUniqueId', $this.context.attributes[2].value)));
}

function printPDF(pdfUrl, acao, data) {
    acao = acao || null;
    data = data || null;
    if (acao) {
        if (data) {
            data['acao'] = acao;
        } else {
            data = {'acao': acao};
        }
        post(pdfUrl, data);
    } else {
        var w = window.open(pdfUrl);
    }
    //w.print();
}

function isDict(v) {
    return typeof v==='object' && v!==null && !(v instanceof Array) && !(v instanceof Date);
}

$(function () {
    $('[data-toggle="select2"]').each(function() {
        const $this = $(this);
        $this.select2({
            theme: "bootstrap",
            language: "pt-BR",
            dropdownParent: $this.parent(),
        });
    });
});

//trim completo
function trim(str) {
    return str.replace(/^\s+|\s+$/g, "");
}

function calculaIdade(x, campo) {
    if (campo?.length && x) {
        var today = new Date();
        var birthDate = new Date(x);
        var age = today.getFullYear() - birthDate.getFullYear();
        var m = today.getMonth() - birthDate.getMonth();
        if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
            age--;
        }
        // campo.html(age);
        campo.val(age);
    }
}

function changeSwitchery(element, checked) {
    if (( element.is(':checked') && checked === false ) || ( !element.is(':checked') && checked === true )) {
        element.parent().find('.switchery').trigger('click');
    }
}

$('.select_operadora').on('click', async function(x){
    try {
        await api.patch(
            `restrito/usuario/select-operadora/`,
            {fk_operadora: $(this).data('id')}
        );
        location.reload();
    } catch (e) {
        toastr.error('Permitido apenas para super usuários','');
    }
});

$('.select_regiao_base').on('click', async function(x){
    try {
        await api.patch(
            `restrito/usuario/select-regiao/`,
            {fk_regiao: $(this).data('id')}
        );
        location.reload();
    } catch (e) {
        toastr.error('Permitido apenas para super usuários e administradores','');
    }
    $('#testeregiao').val($(this).data('id'));

});

function getFormData($form){
    var unindexed_array = $form.serializeArray();
    var indexed_array = {};

    $.map(unindexed_array, function(n, i){
        indexed_array[n['name']] = (indexed_array[n['name']] || '') + n['value'] + ',';
    });

    return indexed_array;
}

function formatRepoSelection (repo) {
    return repo.description || repo.text;
}

function changeRemoveSelect2withoutSelectTrigger(value, $field){
    var newState;
    if ($field.find(`option[value=${value.id}]`).length) {
        $field.find(`option[value=${value.id}]`).remove();
    }
    // Create the DOM option that is pre-selected by default
    newState = new Option(
        window[$field.data('format') || 'formatRepoSelection'](value),
        value.id,
        true,
        true
    );
    // Append it to the select
    $field.append(newState).trigger('change');
}

function changeRemoveSelect2(value, $field){
    var newState;
    if ($field.find(`option[value=${value.id}]`).length) {
        $field.find(`option[value=${value.id}]`).remove();
    }
    // Create the DOM option that is pre-selected by default
    newState = new Option(
        window[$field.data('format') || 'formatRepoSelection'](value),
        value.id,
        true,
        true
    );
    // Append it to the select
    $field.append(newState).trigger('change').trigger('select2:select', [value]);
}

function changeSelect2(value, $field){
    var newState;
    if ($field.find(`option[value=${value.id}]`).length) {
        $field.val(value.id).trigger('change', value);
    } else {
        // Create the DOM option that is pre-selected by default
        newState = new Option(
            window[$field.data('format') || 'formatRepoSelection'](value),
            value.id,
            true,
            true
        );
        // Append it to the select
        $field.append(newState).trigger('change').trigger('select2:select', [value]);
    }
}

const nome_dias_semana = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sabado'];

function atualizaRelogio(){
    var momentoAtual = new Date();

    var vhora = momentoAtual.getHours();
    var vminuto = momentoAtual.getMinutes();
    var vsegundo = momentoAtual.getSeconds();

    var vdia = momentoAtual.getDate();
    var vmes = momentoAtual.getMonth() + 1;
    var vano = momentoAtual.getFullYear();

    if (vdia < 10){ vdia = "0" + vdia;}
    if (vmes < 10){ vmes = "0" + vmes;}
    if (vhora < 10){ vhora = "0" + vhora;}
    if (vminuto < 10){ vminuto = "0" + vminuto;}
    if (vsegundo < 10){ vsegundo = "0" + vsegundo;}

    dataFormat = vdia + " / " + vmes + " / " + vano;
    horaFormat = vhora + " : " + vminuto + " : " + vsegundo;

    // document.getElementById("data_principal").innerHTML = dataFormat;
    document.getElementById("hora_principal").innerHTML = horaFormat;

    setTimeout("atualizaRelogio()",1000);
}
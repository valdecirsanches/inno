/**
 * Created by Diego on 7/10/14.
 */


function ImprimeFicha(){
    var id = $('#id_id').val();;

    printPDF('ImprimeFicha?id='+id)
    /*
    var clinica = $('#id_clinica').val(),
        dentista = $('#id_dentista').val(),
        dateData = datepicker_agenda.datepicker('getDate');
        myDate = dateData.getFullYear()+'-'+(dateData.getMonth()+1)+'-'+dateData.getDate();

    if ((!clinica)||(!dentista)||(!dateData) || (myDate=='NaN-NaN-NaN')){
        toastr.error('Não foi possível realizar a impressão. Selecione a data novamente','Impressao da agenda.')
    }
    else {
        printPDF('Ajax.ImprimeAgenda?id_clinica='+clinica+'&id_dentista='+dentista+'&dt='+myDate)
    }*/
}






$('.btnAlterar').on('click', Alterar);
$('#navCad').on('click', Cadastrar);
$('#navFin').on('click', Financeiro);

function Alterar(){
    id = $(this).val();
    Cadastrar();
}

function Cadastrar(){
    $("#navCad").attr('class', 'active');
    $("#navFin").attr('class', ' ');
    $.ajax({
        data : {'id' : id},
        url : '/paciente/alterar',
        type : 'get',
        success: function(data){
            var html = "";
            for(var i = 0; i< data.length; i++){
                html += '<label for="idNome">Nome</label><input id="idNome" class="form-control" value="'+data[i].fields.nome+'">' +
                        '<label for="idContrato">Contrato</label><input id="idContrato" class="form-control" value="'+data[i].fields.contrato+'">' +
                        '<label for="idMatricula">Matricula</label><input id="idMatricula" class="form-control" value="'+data[i].fields.matricula+'">';
                var clabel = data[i].fields.nome;
            }
            $('#formAlterar').html(html);
            $('#cabecaLabel').html(clabel);
        }
    });
}

function Financeiro(){
    $("#navCad").attr('class', ' ');
    $("#navFin").attr('class', 'active');
    $.ajax({
        data : {'id' : id},
        url : '/paciente/financeiro',
        type : 'get',
        success: function(data){
            console.log(data);
            var html = '<table class="table">' +
                       '<thead>' +
                       '    <tr>' +
                       '        <td>Parc</td>' +
                       '        <td>Vencto</td>' +
                       '        <td>Valor</td>' +
                       '        <td>Vr Pago</td>' +
                       '        <td>Dt Pagto</td>' +
                       '        <td>Dt Lancto</td>' +
                       '        <td>N° Boleto</td>' +
                       '        <td>BLTS</td>' +
                       '    </tr>' +
                       '</thead>' +
                       '<tbody>';
            for(var i = 0; i< data.length; i++){
                html += '   <tr>' +
                        '       <td>' + data[i].fields.parcela + '</td>' +
                        '       <td>' + data[i].fields.vencto + '</td>' +
                        '       <td>' + data[i].fields.vrparcela + '</td>' +
                        '       <td>' + data[i].fields.vrpago + '</td>' +
                        '       <td>' + data[i].fields.pagto + '</td>' +
                        '       <td>' + data[i].fields.lancto + '</td>' +
                        '       <td>' + data[i].fields.numero_bancariox + '</td>' +
                        '       <td>' + data[i].fields.boleto + '</td>' +
                        '       <td><a id="btnBoleto" class="btn btn-primary btn-lg bol" value="' + data[i].pk + '">Boleto</a></td>' +
                        '   </tr>';
                }
                html += '</tbody>' +
                        '</table>';
                $('#formAlterar').html(html);
                $(".bol").addClass("btnBoleto");
        }
    });
}

function Boleto(){
    console.log("teste");
    var par_id = $(this).attr('id');
    console.log(par_id);
    $.ajax({
        data    : {'id_parcela' : par_id },
        url     : '/boleto',
        type    : 'get'
        });
}


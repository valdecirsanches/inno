function ImprimeResumo(){
    $('#resumoConsulta').print();
}

function CarregaResumo(consulta){
    var resumo = '';
    $.ajax({
        url: '/atendimento/CarregaResumo',
        data: {'consulta': consulta},
        method: 'GET',
    }).success(function Ret(data){
        if(data.success) {

        }
        if (data.success.length > 0) {
            $('#resumo').html(data.success);
        }
    });
}

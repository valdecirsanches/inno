
let evolucao_alterado

$(".save_evolucao").on("paste input", function() {
    evolucao_alterado=true
});

$(".save_evolucao").blur( function() {
    if(evolucao_alterado) {
        evolucao_alterado=false
        UpdateEvolucao();
    }
});
$('.save_evolucao').on('select2:close', event =>  UpdateEvolucao());


/* Table Functions */
var $tableEvolucao=$('#tabelaEvolucao');

window.EventsEvolucao = {
    'click .edit': function (e, value, row, index) {
        ReadEvolucao(row.id);
    },
};


function OptionsEvolucao(value, row, index) {
    return [
        '<div>',
        '<a class="edit btn btn-success btn-outline" href="javascript:void(0)" title="Editar">',
        '<i class="glyphicon glyphicon-edit"></i>',
        '</a>',
        '</div>'
    ].join('');
}


$tableEvolucao.on('click-row.bs.table', function (e, row, $element) {
    ReadEvolucao(row.id);
});

async function CarregaEvolucoes(){
    const resp  = await api.post('evolucao/ultimas-evolucoes/', { 'paciente': $('.classAtendimento #id_fk_prontuario').val()});
    if(resp.data.success) {
        $('#id_ultima_evolucao').html(resp.data.success.ultima);
        if(resp.data.success.hoje){
            await ReadEvolucao(resp.data.success.id);
        } else{
            AddEvolucao()
        }
    } else {
        AddEvolucao()
    }
}

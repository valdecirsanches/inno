let diagnostico_alterado

$('.save_diagnostico').on('select2:close', event =>  saveHipoteseDiagnostica());

$(".save_diagnostico").on("paste input", function() {
    diagnostico_alterado=true
});

$(".save_diagnostico").blur( function() {
    if(diagnostico_alterado) {
        diagnostico_alterado=false
        saveHipoteseDiagnostica();
    }
});

async function saveHipoteseDiagnostica() {
    await diagnostico.submit();
}


async function CarregaHipoteseDiagnostica(id){
    const resp =
        await api.post('hipoteseDiagnostica/get-ultima-hipotese-diagnostica/?id_prontuario='+id);
    $('#id_ultima_hipotese_diagnostica').html(resp.data.success.ret);
    diagnostico.index(resp.data.success.id);
}


function SalvaHipoteseDiagnostica(){
    diagnostico.submit();
}


$(window).load(function() {
    AddDiagnostico();
});

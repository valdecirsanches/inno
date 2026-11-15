
var silent = false;
class myDiagnostico extends MyObject {
    async store(data, cb, silent) {
        if (data.diagnostico) {
            data.diagnostico = data.diagnostico.join();
        }
        if (data.outros_diagnosticos) {
            data.outros_diagnosticos = data.outros_diagnosticos.join();
        }
        await super.store(data, cb, silent);
    }

    async setObject(data){
        await super.setObject(data);
        await changeCID10(data.diagnostico, this.form.find('[name=diagnostico]'));
        await changeCID10(data.outros_diagnosticos, this.form.find('[name=outros_diagnosticos]'));
    }
}


const diagnostico = new myDiagnostico(
    'classHipoteseDiagnostica',
    (typeof $tableHopoteseDiagnostica !== 'undefined' ? $tableHipoteseDiagnostica : null),
    'hipoteseDiagnostica/'
);

async function AddDiagnostico() {
    await diagnostico.clear();
    const resp = await api.post(`hipoteseDiagnostica/get-consulta/`, {id_consulta: $('.classAtendimento #id_fk_consulta_atual').val()});
    if (resp.data.success) {
        changeMedico(resp.data.success.fk_medico,$('.classHipoteseDiagnostica #id_fk_medico'));
        diagnostico.setObject({
            ...diagnostico.object,
            fk_medico: resp.data.success.fk_medico,
            fk_consulta: resp.data.success.fk_consulta.id,
            fk_prontuario: resp.data.success.fk_paciente.id,
        });
    }
    $('.classHipoteseDiagnostica #id_diagnostico').empty().trigger('change');
    $('.classHipoteseDiagnostica #id_outros_diagnosticos').empty().trigger('change');
    $('.classHipoteseDiagnostica #id_diagnostico').focus();
}


async function ReadDiagnostico(id) {
    await diagnostico.index(id);
    $('#data_salvo').html(diagnostico.object.dataSalvo);
}

async function UpdateDiagnostico() {
    silent=false;
    var id = diagnostico.object.id;
    await diagnostico.submit();
}

async function CancelaDiagnostico() {
    if (diagnostico.object.id > 0){
        ReadDiagnostico(diagnostico.object.id);
    } else {
        await diagnostico.clear();
        $('.classHipoteseDiagnostica #id_diagnostico').empty().trigger('change');
        $('.classHipoteseDiagnostica #id_outros_diagnosticos').empty().trigger('change');
    }
}

function DeleteDiagnostico(id){
    swal({
        title: "Você tem certeza?",
        text: 'Está ação apagará este diagnostico do cadastro',
        type: "warning",
        showCancelButton: true,
        confirmButtonColor: "#DD6B55",
        confirmButtonText: "Sim, remover!",
        cancelButtonText: "Não",
    }).then(async function () {
        await diagnostico.delete(id);
        diagnostico.clear();
    });
}



class Paciente extends MyObject {
    clear() {
        super.clear();
    }
}

const paciente = new Paciente(
    'classPaciente', null,
    // (typeof $tablePaciente !== 'undefined' ? $tablePacienteConsulta : null),
    'paciente/'
);

function CreatePaciente() {
    paciente.clear();
    $tablePacienteConsulta.bootstrapTable('refresh');
    $('#modalPaciente').modal('show');
    $('.classPaciente #id_fk_paciente').focus();
}

async function ReadPaciente(id) {
    await paciente.index(id);
    $('a[href=#cadastro]').tab('show');
}

async function ShowPaciente(id) {
    await paciente.index(id);
    $tablePacienteConsulta.bootstrapTable('refresh',{query: {paciente: paciente.object.id}});
    $('#modalPaciente').modal('show');
}

async function ReadPaciente1(id) {
    await paciente.index(id);
    $('.classPaciente #id_paciente').focus();

}

async function UpdatePaciente() {
    await paciente.submit();
}

async function Homonimos(){
    const response = await api.post(`${paciente.uri()}homonimo/`);
    if (response.data.success){
        var msg = '<table class="table table-condensed table-hover"><thead><tr><th>Código</th><th>Nome</th><th>Idade</th><th>Nascimento</th></tr></thead><tbody>';
        for (var i=0; i < response.data.success.length; i++){
            msg += "<tr ondblclick='ReadPaciente("+ response.data.success[i].id +")'>" +
                "<td>" + response.data.success[i].codigo   + "</td>" +
                "<td>" + response.data.success[i].paciente + "</td>" +
                "<td>" + response.data.success[i].idade    + "</td>" +
                "<td>" + response.data.success[i].nasc     + "</td>" +
                "</tr>" ;
        }
        msg += '</tbody></table>';
        swal("Encontrado(s) Prontuário(s) Homônimo(s) em nossa base de dados",msg,'error');
    }
}


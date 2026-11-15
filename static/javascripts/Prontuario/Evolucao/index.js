
//Valdecir Sanches/Diego Sanches

class classevolucao extends MyObject {
    //
    // async store(data, cb) {
    //     await super.store(data, cb);
    //     $('#id_evolucao').val("");
    //     await CarregaEvolucoes();
    // }
}

const evolucao = new classevolucao(
    'classEvolucao',
    (typeof $tableEvolucao !== 'undefined' ? $tableEvolucao : null),
    'evolucao/'
);

async function AddEvolucao() {
    evolucao.clear();
    const resp = await api.post(`evolucao/get-consulta/`, {id_consulta: $('.classAtendimento #id_fk_consulta_atual').val()});
    if (resp.data.success) {
        evolucao.setObject({
            ...evolucao.object,
            fk_medico: resp.data.success.fk_medico,
            fk_consulta: resp.data.success.fk_consulta.id,
            fk_prontuario: resp.data.success.fk_paciente.id,
        });
    }
    $('.classEvolucao #id_evolucao').focus();
}


async function ReadEvolucao(id) {
    await evolucao.index(id);
    $('#evolucao_data_salvo').html(evolucao.object.dataSalvo);
}

async function UpdateEvolucao(quiet) {
    silent = quiet	
    await evolucao.submit();
    $('#evolucao_data_salvo').html(evolucao.object.dataSalvo);
}

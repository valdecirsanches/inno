
class myRelatorio extends MyObject {
    async store(data, cb, silent) {
        if (data.cid10) {
            data.cid10 = data.cid10.join();
        }
        await super.store(data, cb, silent);
    }

    async setObject(data){
        await super.setObject(data);
        await changeCID10(data.cid10, this.form.find('[name=cid10]'));
    }
}

function relatorio_libera_edicao(action) {
    $('#div_relatorio *').prop('disabled', !action);
    if (!action) {
        $('.btn-relatorio').addClass('disabled');
    } else {
        $('.btn-relatorio').removeClass('disabled');
    }
}
relatorio_libera_edicao(false);

// '$(window).on('load', function () {
//     AddRelatorio();
// });


const relatorio = new myRelatorio(
    'classProntuarioRelatorio',
    (typeof $tableRelatorios !== 'undefined' ? $tableRelatorios : null),
    'relatorio/'
);

async function AddRelatorio() {
    await relatorio.clear();
    const resp = await api.post(`relatorio/get-consulta/`, {id_consulta: $('.classAtendimento #id_fk_consulta_atual').val()});
    if (resp.data.success) {
        changeMedico(resp.data.success.fk_medico,$('.classProntuarioRelatorio #id_fk_medico'));
        relatorio.setObject({
            ...relatorio.object,
            fk_medico: resp.data.success.fk_medico,
            fk_consulta: resp.data.success.fk_consulta.id,
            fk_prontuario: resp.data.success.fk_paciente.id,
        });
    }
    relatorio_libera_edicao(true);
    $('.classProntuarioRelatorio #id_cid10').empty().trigger('change');
    $('#relatorio_data_salvo').html('     <span class="badge badge-primary">   N o v o   </span>');
    $('.classProntuarioRelatorio #id_titulo_relatorio').focus();
}


async function ReadRelatorio(id) {
    await relatorio.index(id);
    // $('#div_relatorio *').prop('disabled',false);
    relatorio_libera_edicao(true);
    $('#relatorio_data_salvo').html(relatorio.object.dataSalvo);
}

async function UpdateRelatorio(silent=false) {
    var id = relatorio.object.id;
    await relatorio.submit(silent=silent);
    if ($tableRelatorios.bootstrapTable('getRowByUniqueId', id)) {
        $tableRelatorios.bootstrapTable('updateByUniqueId', {id: id, row: relatorio.object});
    } else {
        $tableRelatorios.bootstrapTable('insertRow',{index: 0, row: relatorio.object});
    }
    $tableRelatorios.bootstrapTable('checkBy', {field: 'id', values: [relatorio.object.id]});
}

function DeleteRelatorio(id){
    swal({
        title: "Você tem certeza?",
        text: 'Está ação apagará este relatório do cadastro',
        type: "warning",
        showCancelButton: true,
        confirmButtonColor: "#DD6B55",
        confirmButtonText: "Sim, remover!",
        cancelButtonText: "Não",
    }).then(async function () {
        await relatorio.delete(id);
        relatorio.clear();
        $tableRelatorios.bootstrapTable('remove', {field: 'id', values: [id]});
        // $('#div_relatorio *').prop('disabled',true);
        relatorio_libera_edicao(false);
    });
}

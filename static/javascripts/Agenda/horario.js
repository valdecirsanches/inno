
function HrExclui(row) {
    swal({
        title: "Exclusão de horario da agenda.",
        html: '<div class="col-lg-12">'+
            '<p><h1>Excluir horário das ' + row.hr_format + '</h1></p> </div>',
        type: "warning",
        showCancelButton: true,
        confirmButtonColor: "#DD6B55",
        confirmButtonText: "Sim, excluir!",
        cancelButtonText: "Não",
        focusCancel: true,
        showLoaderOnConfirm: true,
        preConfirm: function (result) {
            return new Promise(function (resolve) {
                resolve()
                $.ajax({
                    url: '/agenda/consultas/hr_exclui/',
                    data: {
                        id: row.id,
                        dt: $('#id_nova_data').val()
                    },
                    method: 'POST',
                    success: Ret
                });
                function Ret(data){
                    if (data.success){
                        $tableConsultas.bootstrapTable('removeByUniqueId', data.success);
                        toastr.success('Procedimento exwecutado com sucesso!','Exclusão de horário');
                    }
                }

            });
        }
    });

};


function HrsExclui(row) {
    const ids = $('#tabelaConsultas').bootstrapTable('getSelections').map(({id}) => id);
    const id__in = ids.join(',');
    if (!id__in) {
        swal('Você não marcou os horários a serem excluidos.', '', 'error');
    } else {
        swal({
            title: "Exclusão de horários selecionados.",
            type: "warning",
            showCancelButton: true,
            confirmButtonColor: "#DD6B55",
            confirmButtonText: "Sim, excluir todos!",
            cancelButtonText: "Não",
            focusCancel: true,
            showLoaderOnConfirm: true,
            preConfirm: function (result) {
                return new Promise(function (resolve) {
                    resolve();
                    $.ajax({
                        url: '/agenda/consultas/hrs_exclui/',
                        data: {
                            id__in: id__in,
                        },
                        method: 'POST',
                        success: Ret
                    });

                    function Ret(data) {
                        if (data.success) {
                            AtualizarAgenda();
                            toastr.success('Procedimento executado com sucesso!','OK');
                        }
                    }

                });
            }
        });
    }
};


function HrClone(row) {

    var dateData = $dataAgenda.datepicker('getDate'),
        myDate = dateData.getFullYear()+'-'+(dateData.getMonth()+1)+'-'+dateData.getDate(),
        medico = $('#medico').val();

    swal({
        title: "Clone de horário das "+row.hr_format,
        // html: '<div class="col-lg-12">'+
        //     '<p><h1>Horário das ' + row.hr_format + '</h1></p> </div>',

        html: '<form>'+
              '  <div> '+
              '    <div class="text-center">'+
              '      <label for="id_tipo_horario">Selecione o periodo...</label>'+
              '      <select id="id_tipo_horario"  placeholder="Periodo...">'+
              '			<option value="AM">Tipo A Manhã</option>'+
              '			<option value="BM">Tipo B encaixe Manhã</option>'+
              '			<option value="CM">Tipo C encaixe Manhã</option>'+
              '           <option value="AT">Tipo A Tarde</option>'+
              '			<option value="BT">Tipo B encaixe Tarde</option>'+
              '			<option value="CT">Tipo C encaixe Tarde</option>'+
              '	     </select>'+
              '    </div>'+
              '  </div>'+
              '</form>',

        type: "warning",
        showCancelButton: true,
        confirmButtonColor: "#DD6B55",
        confirmButtonText: "Sim, clonar!",
        cancelButtonText: "Não",
        focusCancel: true,
        showLoaderOnConfirm: true,
        onOpen: function() {
            $('#id_tipo_horario').val(row.agenda_periodo);
        },
        preConfirm: function (result) {

            return new Promise(function (resolve) {
                resolve()
                $.ajax({
                    url: '/agenda/consultas/hr_clone/',
                    data: {
                        id: row.id,
                        dt: myDate,
                        tp: $('#id_tipo_horario').val()
                    },
                    method: 'POST',
                    success: Ret
                });
                function Ret(data){
                    if (data.success){
                        AtualizarAgenda();
                        toastr.success('Procedimento executado com sucesso!','Clone de horário');
                    }
                }

            });
        }
    });

}


function Transfere(row){
    swal({
        title: "Transferência de consulta",
        html: '<form><div> '+
            '<div class="text-center">'+
            '     <label for="id_nova_data1">Transferir para...</label>'+
            '     <input id="id_nova_data1" type="datetime-local"   name="nova_data1" class="swal2-fade">'+
            '</div>'+
            '</div></form>',
        type: "warning",
        showCancelButton: true,
        confirmButtonColor: "#DD6B55",
        confirmButtonText: "Sim, transferir!",
        cancelButtonText: "Não",
        focusCancel: true,
        // closeOnConfirm: true,
        showLoaderOnConfirm: true,
        onOpen: function() {
            $('#id_nova_data1').val(row.dt+' '+row.hr_format)},
        preConfirm: function (result) {

            return new Promise(function (resolve) {
                resolve()
                $.ajax({
                    url: '/agenda/consultas/TransfereDia',
                    data: {
                        id: row.id,
                        dt: $('#id_nova_data1').val()
                    },
                    method: 'POST',
                    success: Ret
                });
                function Ret(data){
                    if (data.success){
                        AtualizarAgenda();
                        toastr.success('Transferência para outro dia','OK');
                    }
                }

            });
        }
    });

}
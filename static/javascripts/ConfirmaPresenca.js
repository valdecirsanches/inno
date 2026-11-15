



function ConfirmaPresenca() {
    swal({
        title: 'Confirma a presença?',
        text: 'Excluir '+row.convenio,
        type: "warning",
        showCancelButton: true,
        cancelButtonText: "Desistir",
        confirmButtonColor: "#DD6B55",
        confirmButtonText: "Sim, excluir",
        closeOnConfirm: false
    }).then(function(isConfirm){
        if (isConfirm){
            window.close();
        }
    });
}

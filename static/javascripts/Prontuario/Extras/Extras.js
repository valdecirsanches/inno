function CarregaUploads(){
    CarregaExtras($('#id_fk_prontuario').val());
}
function CarregaExtras(id){
    $.ajax({
        url: '/prontuario/Extras/CarregaExtras',
        data: {
            'prontuario': id
        },
        method: 'GET',
    }).success(function Ret(data){
        if(data.success){
            var $listaArquivo = $('#listaArquivos');
            $listaArquivo.html('');
            for (var i in data.success) {
                if (data.success.hasOwnProperty(i)) {
                    var file = data.success[i];
                    $listaArquivo.append(
                        '<div class="file-box">' +
                        '   <div class="file">' +
                        '       <a href="' + file.url + '" target="_blank">' +
                        '           <span class="corner"></span>' +
                        '           <div class="icon">' +
                        '               <i class="fa fa-file"></i>' +
                        '           </div>' +
                        '           <div class="file-name text-box tex">' + file.nome.substring(0, 25) +
                        '               <br/>' +
                        '               <small>adicionado em: ' + file.data + '</small>' +
                        '           </div>' +
                        '       </a>' +
                        '       <div class="text-center"> '+
                        '           <a onClick="DeleteDocumento(\'' + file.id + '\', \'' + file.pasta + '\', \'' + file.nome + '\')" ' +
                        '             class="btn btn-danger btn-outline btn-xs btn-rounded?><i class="fa fa-trash"> Excluir</i></a>' +
                        '       </div>'+
                        '   </div>' +

                        '</div>'
                    );
                }
            }
        }
    });
}

function ArquivoRecebido(ret) {
    post('/prontuario/Extras/downloadFile.json', {extra: ret}, 'GET');
}

function DeleteDocumento(id, pasta, nome){
    swal({
        title:'Exclusão: '+ nome,
        html: `<div>Excluir: <span style="color: #bd2130">${nome}</span></div>`,
        text: 'Está ação apagará este documento',
        type: "warning",
        showCancelButton: true,
        confirmButtonColor: "#DD6B55",
        confirmButtonText: "Sim, remover!",
        cancelButtonText: "Não",
        // closeOnConfirm: true
    }).then( function () {
        $.ajax({
            url: '/prontuario/Extras/uploadFile.json',
            data: {
                'doc': id,
            },
            method: 'Delete',
        }).success(function Ret(data) {
            CarregaExtras(data.success);
            toastr.info('...', 'Excluido!!!');
        });
    });
}

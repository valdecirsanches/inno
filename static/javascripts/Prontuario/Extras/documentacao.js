
function CarregaUploads() {
    CarregaDocumentacao(
        $('.classPaciente #id_id').val(),
        $('.classPaciente #id_pasta').val()
        );
}


function CarregaDocumentacao(id, pasta) {
    $.ajax({
        url: '/cadastros/pacientes/carregaDocumento/',
        data: { id_paciente: id, pasta: pasta },
        success: function (data) {
            if (data.success) {
                var $listaDocumento = $('#listaDocumento');
                $listaDocumento.html('');
                for (var i in data.success) {
                    if (data.success.hasOwnProperty(i)) {
                        var file = data.success[i];
                        $listaDocumento.append(
                            '<div class="file-box">' +
                            '   <div class="file">' +
                            '       <a onClick="ArquivoRecebido(\'' + file.id + '\')">' +
                            '           <span class="corner"></span>' +
                            '           <div class="icon">' +
                            '               <i class="fa fa-file"></i>' +
                            '           </div>' +
                            '           <div class="file-name">' + file.nome +
                            '               <br/>' +
                            '               <small>adicionado em: ' + file.data + '</small>' +
                            '           </div>' +
                            '       </a>' +
                            '   </div>' +
                            '</div>'
                        );
                    }
                }
            }
        }
    });
}



function ArquivoRecebido(ret) {
    post('/cadastros/pacientes/downloadDocumento/', {extra: ret}, 'GET');
}

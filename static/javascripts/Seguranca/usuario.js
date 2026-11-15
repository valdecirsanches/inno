function FechaUsuario(){
    $('#id_TelaUsuario').addClass('hidden');
}

var $tableUsuario = $('#tabelaUsuario');

$tableUsuario.on('dbl-click-row.bs.table', function (e, row) {
    ReadUsuario(row);
});

function FormatoUsuario(value, row, index) {
    return [
        '<div class="">',
        '<a class="edit btn btn-primary btn-xs m-r-xs" href="javascript:void(0)" title="Altera dados da Usuario">',
        '<i class="fa fa-edit"> </i>',
        '</a>',
        '<a class="del btn btn-danger btn-xs m-r-xs" href="javascript:void(0)" title="Excluir Usuario">',
        '<i class="fa fa-trash"> </i>',
        '</a>',
        '</div>'
    ].join('');
}

window.EventoUsuario = {
    'click .edit': function (e, value, row) {
        ReadUsuario(row);

    },
    'click .add': function (e, value, row) {
        AddUsuario(row.id);

    },
    'click .access': function (e, value, row) {
        // {#Permissao(row.id);#}

    },
    'click .del': function (e, value, row) {
        DelUsuario(row.id);

    }
};

function AddUsuario(){
    $('.classUsuario input').val('');
    $('.classUsuario textarea').val('');
    $('.classUsuario #id_login').focus();
}



function ReadUsuario(row) {
    $('#id_TelaUsuario').removeClass('hidden');
    for (const [key, value] of Object.entries(row)) {
        if ((value === 'None') || (value === null)) {$('.classUsuario #id_' + key).val('');}
        else if (value.toString() === 'true') {$('.classUsuario #id_'+key).prop('checked', true)}
        else if (value.toString() === 'false') {$('.classUsuario #id_' + key).prop('checked', false)}
        else {$('.classUsuario #id_' + key).val(value)}
    }
    $('.classUsuario #id_login').focus();
}

function SalvaUsuario() {
    $.ajax({
        url: 'usuario.json/',
        data: {
            form: $('.classUsuario').serialize(true),
            id: $('.classUsuario #id_id').val()
        },
        type: 'POST',
    }).success(function Ret(data) {
        if (data.success) {
            $tableUsuario.bootstrapTable('refresh');
            toastr.success('Dados salvos com sucesso!', 'Gravando dados da Usuario.');
            FechaUsuario();
        }
        else {
            swal('Salvando dados de usuário', data.error, 'error');
        }
    });
}

function DelUsuario(id) {
    swal({
        title: "Excluir a Usuario do cadastro",
        text: "Todos os dados cadastrais do Usuário serão excluídos!",
        type: "warning",
        showCancelButton: true,
        confirmButtonColor: "#DD6B55",
        confirmButtonText: "Sim, excluir!",
        cancelButtonText: "Não",
    }).then( function () {
        $.ajax({
            url: 'usuario.json/',
            data: {id: id},
            type: 'DELETE',
        }).success(function Ret(data) {
            if (data.success) {
                toastr.success('Excluido com sucesso', 'Exclusao de usuário.');
            } else {
                toastr.error('Erro ao excluir o usuário', 'Exclusao de usuário. Nada feito!');
            }
        });
    });
}

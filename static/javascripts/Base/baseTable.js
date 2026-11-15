function getIdSelections($table) {
    return $.map($table.bootstrapTable('getSelections'), function (row) {
        return row.id;
    });
}

function FormatoEditar(value, row, index){
    return [
        '<button class="btn btn-primary edit btn-sm" title="Editar">',
            '<i class="glyphicon glyphicon-edit"></i>',
        '</button>'
    ].join('');
}

function FormatoExcluir(value, row, index){
    return [
        '<a class="excluir ml10" href="javascript:void(0)" title="Excluir">',
            '<i class="glyphicon glyphicon-trash"></i>',
        '</a>'
    ].join('');
}

function VrFormatter(value) {
    return currencyFormatted(parseFloat(value));
}

function vrFormatter(value) {
    return currencyFormatted(parseFloat(value));
}

function decimalFormatter(value) {
    return parseFloat(value).toLocaleString('pt_br');
}

function dateFormatter(value) {
    return moment(value).format('DD/MM/YYYY');
}

function TimeFormatter(value) {
    return moment(value).format('hh:mm');
}

function dateTimeFormatter(value) {
    return moment(value).format('DD/MM/YYYY hh:mm:ss');
}

function FormatoHorario(value, row, index){
    const hour = value.split(':');
    return `<h4>${hour[0]}:${hour[1]}</h4>`;
}
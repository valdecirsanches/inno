/**
 * Created by Sanches on 02/03/15.
 */
$(document).ready(function() {
    $('.dataTables-example').dataTable({
        responsive: true,
        "dom": 'T<"clear">lfrtip',
        "tableTools": {
            "sSwfPath": "js/plugins/dataTables/swf/copy_csv_xls_pdf.swf"
        }
    });

    /* Init DataTables */
    var oTable = $('#editable').dataTable({
        "dom": 'T<"clear">lfrtip',
        "tableTools": {
            "sSwfPath": "../../static/js/plugins/dataTables/swf/copy_csv_xls_pdf.swf",
            "aButtons": [
                "copy",
                "csv",
                "xls",
                "pdf",
                "print"
            ]
        },
        stateSave: true,
        "language": {
            "lengthMenu":     "Mostrar _MENU_ Registros/página",
            "zeroRecords":    "Nada encontrado - desculpe",
            "info":           "Mostrando página _PAGE_ de _PAGES_",
            "infoEmpty":      "Não há registros disponíveis",
            "infoFiltered":   "(Conteúdo total sem o filtro: _MAX_ registros)",
            "emptyTable":      "Não há registros no arquivo.",
            "infoPostFix":    "",
            "thousands":      ",",
            "loadingRecords": "Carregando...",
            "processing":     "Processando...",
            "search":         "Pesquisar:",
            "paginate": {
                "first":      "Primeiro",
                "last":       "Último",
                "next":       "Próximo",
                "previous":   "Anterior"
            },
            "aria": {
                "sortAscending":  ": Ordem crescente",
                "sortDescending": ": Ordem descrescente"
            }
        }
    });

    /* Apply the jEditable handlers to the table */
    oTable.$('td').editable( '../example_ajax.php', {
        "callback": function( sValue, y ) {
            var aPos = oTable.fnGetPosition( this );
            oTable.fnUpdate( sValue, aPos[0], aPos[1] );
        },
        "submitdata": function ( value, settings ) {
            return {
                "row_id": this.parentNode.getAttribute('id'),
                "column": oTable.fnGetPosition( this )[2]
            };
        },

        "width": "90%",
        "height": "100%"
    } );


});
var vm;
var larg = 4,
    dlarg = 32,
    dist = 265,
    borda = 3,
    w = 784;

if (screen.height >= 900){
    larg = 5;
    dlarg = 34;
    dist = 280;
    borda = 5;
    w = 828;
}

function drawDente(svg, parentGroup, dente){
    if(!dente) {throw new Error('Error no se ha especificado el dente.');}
    var x = dente.x || 0,
        y = dente.y || 0;
    var defaultPolygon = {
      fill: 'white',
      stroke: 'black',
      strokeWidth: 1
    };
    var denteGroup = svg.group(parentGroup, {
      transform: 'translate(' + x + ',' + y + ')'
    });
    var faceSuperior = svg.ellipse(denteGroup, 12, 2, 11, larg, defaultPolygon);
    faceSuperior = $(faceSuperior).data('face', 'S');
    var faceInferior =  svg.ellipse(denteGroup, 12, 22, 11, larg, defaultPolygon);
    faceInferior = $(faceInferior).data('face', 'I');
    var faceDerecha = svg.ellipse(denteGroup, 22, 12, larg, 11, defaultPolygon);
    faceDerecha = $(faceDerecha).data('face', 'D');
    var faceIzquierda = svg.ellipse(denteGroup, 2, 12, larg, 11, defaultPolygon);
    faceIzquierda = $(faceIzquierda).data('face', 'Z');
    var faceCentral = svg.polygon(denteGroup, [[6,6],[18,6],[18,18],[6,18]], defaultPolygon);
    faceCentral = $(faceCentral).data('face', 'C');
    var faceCompleto = svg.text(denteGroup, 6, 37, dente.id.toString(), {
      fill: 'black',
      stroke: 'black',
      strokeWidth: 0.1,
      style: 'font-size: 8pt;font-weight:bold'
    });
    faceCompleto = $(faceCompleto).data('face', 'X'); //Busco los tratamentos aplicados al dente

    var tratamentosAplicadosAlDente = $.map(vm.tratamentosAplicados, function(t){
        return t.dente.id === dente.id ? t : null;
    });
    var faces = [];
    faces.S = faceSuperior;
    faces.C = faceCentral;
    faces.I = faceInferior;
    faces.Z = faceIzquierda;
    faces.D = faceDerecha;
    faces.X = faceCompleto;

    for (var i = tratamentosAplicadosAlDente.length - 1; i >= 0; i--) {
        var t = tratamentosAplicadosAlDente[i];

        if (t.tratamento.id === "C"){
            faces[t.face].attr('fill', 'black');
        } else if (t.tratamento.id === "R") {
            faces[t.face].attr('fill', 'blue');
        } else if (t.tratamento.id === "A") {
            faces[t.face].attr('fill', 'darkgray');
        } else {
            faces[t.face].attr('fill', 'red');
        }
    }

    $.each([faceCentral, faceIzquierda, faceDerecha, faceInferior, faceSuperior, faceCompleto], function(index, value){
        value.click(function(){
            var me = $(this);
            var face = me.data('face');

            swal({
                type: 'question',
                title: 'Selecione a situação do dente',
                input: 'radio',
                inputOptions: {
                    'H': 'Hígido',
                    'E': 'Extração indicada',
                    'A': 'Ausente',
                    'C': 'Cariado',
                    'R': 'Restaurado'
                },
                text: 'Adicionar a situação do dente',
                showCancelButton: true,
                preConfirm: function (result) {
                    return new Promise(function (resolve) {
                        if (result) {
                            $.ajax({
                                url: window.location.pathname + '/',
                                type: 'POST',
                                data: post('', {
                                  dente: dente.id,
                                  face: face,
                                  tratamento: result
                                }, '', true),
                                success: function () {
                                    // alert(vm.tratamentoSelecionado(result));
                                    var tratamento = vm.tratamentoSelecionado(result);
                                    var a = vm.tratamentosAplicados.find(function (x) {
                                        return x.dente.id === dente.id && x.face === face;
                                    });
                                    if (typeof a !== 'undefined') {
                                        var b = vm.tratamentosAplicados.indexOf(a);
                                        vm.tratamentosAplicados.splice(b, 1);
                                    }

                                    if (result !== "H") {
                                        vm.tratamentosAplicados.push({
                                            dente: dente,
                                            face: face,
                                            tratamento: tratamento
                                        });
                                    } // Actualizo el SVG

                                    renderSvg();
                                    resolve();
                                    // swal('Adicionado!', 'Procedimento adicionado.', 'success');
                                },
                                error: function () {
                                    swal('Não adicionado!', 'Procedimento não adicionado.', 'error');
                                }
                            });
                        }
                        else {
                            swal('Não adicionado!', 'Situação da face não escolhida', 'error');
                        }
                    })
                }
            })
        }).mouseenter(function(){
            var me = $(this);
            me.data('oldFill', me.attr('fill'));
            me.attr('fill', '#D1D1D1');
        }).mouseleave(function(){
            var me = $(this);
            me.attr('fill', me.data('oldFill'));
        });
    });
}

function renderSvg(){
    var svg = $('#odontograma').svg('get').clear();
    var parentGroup = svg.group({
      transform: 'scale(1.5)'
    });
    var dentes = vm.dentes;

    for (var i =  dentes.length - 1; i >= 0; i--) {
        var dente =  dentes[i];
        drawDente(svg, parentGroup, dente);
    }
} //View Models

function DenteModel(id, x, y){
    var self = this;
    self.id = id;
    self.x = x;
    self.y = y;
}

function ViewModel(){
    var self = this;
    self.tratamentosPossiveis = [{
      id:"A"
    }, {
      id:"E"
    },{
      id:"H"
    }, {
      id:"C"
    }, {
      id:"R"
    }];

    self.tratamentoSelecionado = function(value){
        return self.tratamentosPossiveis.find(function(x){
          return x.id === value;
        });
    };

    self.tratamentosAplicados = [];

    self.fecharTratamento = function(tratamento){
        self.tratamentosAplicados.remove(tratamento);
        renderSvg();
    }; //Cargo los dentes


    var dentes = []; //Dentes izquierdos
    var i;
    for(i = 0; i < 8; i++){
        dentes.push(new DenteModel(18 - i, (i * dlarg) + 5, borda));
    }

    for(i = 3; i < 8; i++){
        dentes.push(new DenteModel(58 - i, (i * dlarg) + 5, 55 + borda));
    }

    for(i = 3; i < 8; i++){
        dentes.push(new DenteModel(88 - i, (i * dlarg) + 5, 2 * 55 + borda));
    }

    for(i = 0; i < 8; i++){
        dentes.push(new DenteModel(48 - i, (i * dlarg) + 5, 3 * 55 + borda));
    } //Dentes derechos


    for(i = 0; i < 8; i++){
        dentes.push(new DenteModel(21 + i, (i * dlarg) + 5 + dist, borda));
    }

    for(i = 0; i < 5; i++){
        dentes.push(new DenteModel(61 + i, (i * dlarg) + 5 + dist, 55 + borda));
    }

    for(i = 0; i < 5; i++){
        dentes.push(new DenteModel(71 + i, (i * dlarg) + 5 + dist, 2 * 55 + borda));
    }

    for(i = 0; i < 8; i++){
        dentes.push(new DenteModel(31 + i, (i * dlarg) + 5 + dist, 3 * 55 + borda));
    }

    self.dentes = dentes;
}

vm = new ViewModel(); //Inicializo SVG

$('#odontograma').svg({
    settings:{
      width: w + 'px',
      height: '311px'
    }
});

//TODO: Cargo el estado del odontograma


renderSvg();

ion.sound({
    sounds: [
        {name: "Beep"}
    ],
    path: "/static/plugins/ion.sound/sounds/",
    preload: true,
    volume: 1.0
});

/*$(window).load(function() {
    AtualizaSenha(true);
    setInterval(AtualizaSenha, 2000);
});*/

/*function AtualizaSenha(primeira){
    Ajax.Cadastros.Tarefas.Painel.AtualizaSenha(function(data){
        if(primeira) {
            $("#senha").html(data.senha);
        }
        else {
            if (data.alterada) {
                if (data.senha != $("#senha").html()){
                    $("#senha").html(data.senha);
                    ion.sound.play("Beep");
                } else {
                    ion.sound.play("Beep");
                }
            }
        }
    }, {'tipo':'TV'});
}*/
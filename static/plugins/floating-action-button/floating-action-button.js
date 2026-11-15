let FAB = document.getElementsByClassName('menu--open');
for (var i = 0; i < FAB.length; i++){
    FAB[i].addEventListener("click", function (event) {
        this.parentElement.classList.toggle("menu--opened");
    })
}
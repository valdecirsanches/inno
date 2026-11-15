class MyObject {
    constructor(classe, table, url){
        this.form = $(`.${classe}`);
        this.form.submit(e => {
            e.preventDefault();
            this.store(this.form.serializeObject());
        });
        this.table = table;
        this.classe = classe;
        this.object = this.form.serializeObject();
        this.url = url;
    }

    async index(id){
        try {
            const response = await api.get(this.uri(id));
            this.setObject(response.data);
        } catch (err) {
            throw err;
        }
    }

    async store(data, cb, silent=false){
        try {
            const uri = this.uri();
            const apiType = this.object.id ? api.put : api.post;
            const tableResponse = this.object.id ?
                () => ['updateByUniqueId', {id: this.object.id, row: this.object}] :
                () => ['append', this.object];
            const response = await apiType(uri, data);
            this.setObject(response.data);
            this.form.errorObject('', this.classe);
            if (typeof cb === 'function') {
                cb();
            }
            if (this.table) {
                if (typeof this.table === 'function'){
                    this.table()?.bootstrapTable(...tableResponse());
                } else {
                    this.table.bootstrapTable(...tableResponse());
                }
            }
            if (!silent) {toastr.success('Dados salvos com sucesso!', 'Gravando dados.');}
        } catch (error) {
            if (error.response?.data) {
                this.form.errorObject(error.response.data, this.classe);
                if (!silent) {toastr.error('Erro na validação dos dados, verifique os campos assinalados em vermelho!', 'Dados nao salvos!');}
            } else {
                if (!silent) {toastr.error('Tente novamente', 'Erro inesperado!');}
            }
            throw error;
        }
    }

    async delete(id, table){
        try {
            const ident = id || this.object.id;
            await api.delete(this.uri(id));
            toastr.success('removido com sucesso!', 'Removendo dados.');
            if (this.table){
                if (typeof this.table === 'function') {
                    this.table(table).bootstrapTable('removeByUniqueId', ident);
                } else {
                    this.table.bootstrapTable('removeByUniqueId', ident);
                }
            }
            if (!id) {
                this.clear();
            }
        } catch (error) {
            toastr.error('Não removido!', 'Erro ao remover.');
        }
    }

    setObject(data){
        this.object = data;
        this.form.deserializeObject(this.object);
        this.form.errorObject('', this.classe);
    }

    getObject(){
        return this.form.serializeObject();
    }

    async submit(cb, silent=false){
        await this.store(this.getObject(), cb, silent);
    }

    clear(){
        const obj = Object.fromEntries(Object.entries(this.object).map(([key]) => ([key, ''])));
        this.setObject(obj);
    }

    uri(id){
        const val = id || this.object.id || '';
        return `${this.url}${val}${val && '/'}`;
    }
}


class MyObjectPartial extends MyObject {
    async store(data, cb){
        try {
            const uri = this.uri();
            const apiType = api.patch;
            const tableResponse = () => ['updateByUniqueId', {id: this.object.id, row: this.object}];
            const response = await apiType(uri, data);
            this.setObject(response.data);
            this.form.errorObject('', this.classe);
            if (typeof cb === 'function') {
                cb();
            }
            if (this.table) {
                this.table.bootstrapTable(...tableResponse());
            }
            toastr.success('Dados salvos com sucesso!', 'Gravando dados.');
        } catch (error) {
            if (error.response.data) {
                this.form.errorObject(error.response.data, this.classe);
                toastr.error('Erro na validação dos dados, verifique os campos assinalados em vermelho!', 'Dados nao salvos!');
            } else {
                toastr.error('Tente novamente', 'Erro inesperado!');
            }
            throw error;
        }

    }
}


class ListObjects{
    constructor(tag, objectClass, ibox, iboxAdd){
        this.tag = tag;
        this.objectClass = objectClass;
        this.objects = [];
        this.ibox = ibox;
        this.iboxAdd = iboxAdd;

        this.notify();
    }

    notify(){
        const addObject = this.ibox.clone();
        addObject.append(this.iboxAdd);
        const parsedObjects = [...this.objects.map((obj, index) => {
            const newBox = this.ibox.clone();
            newBox.append(obj.setView(index));
            return newBox;
        }), addObject];

        $(this.tag).html(parsedObjects);
    }

    subscribe(objs, clear, edit){
        if (clear) { this.objects = []; }
        objs.forEach(obj => {
            const object = new this.objectClass(obj, edit);
            this.objects.push(object);
        });
        this.notify();
    }

    unsubscribe(index){
        this.objects = this.objects.filter((obj, listIndex) => {
            if(listIndex !== index){
                return obj;
            }
        });
        this.notify();
    }

    setEditable(index){
        this.objects = this.objects.map((obj, listIndex) => {
            if(index === listIndex){
                obj.editable = !obj.editable;
            }
            return obj;
        });
        this.notify();
    }

    store(){
        const parsedObjects = this.objects.map(obj => {
            if(obj.form){
                const object = obj.form.serializeObject();
                if(obj.object.id !== 0){
                    object.id = obj.object.id;
                }
                return object;
            }
            const object = obj.object;
            for (let key in object) {
                if (object.hasOwnProperty(key)){
                    if(isDict(object[key])) {
                        object[key] = object[key].id;
                    }
                }
            }

            return object;
        });

        return parsedObjects;
    }
}


function parseData(obj){
    for(let o in obj){
        if (obj.hasOwnProperty(o)){
            obj[o] = /\{.*\:*\}/g.test(obj[o]) ? JSON.parse(obj[o]) : obj[o];
        }
    }
    return obj;
}

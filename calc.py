import json
new=json.load(open('comparador-eletricidade/data/ofertas.json')); old=json.load(open('old.json'))
P=new['params']; POTS=new['pots']
def pr(o,k,i):
    a=o[k]; tf=a[0][i] if isinstance(a[0],list) else a[0]
    e=[(x[i] if isinstance(x,list) else x) for x in a[1:]]
    return tf,e
def fatura(tf,e,i,kwh,dias=30,desc_tf=0,desc_e=0):
    pot=POTS[i]; tar=P['TAR_POT'][i] if i<3 else 0
    tf=tf*(1-desc_tf); e=e*(1-desc_e)
    lim=P['KWH_IVA6']*dias/30
    sh6=min(1,lim/kwh) if pot<=6.9 else 0
    ivaE=sh6*1.06+(1-sh6)*1.23
    tfa=tf*dias; tara=tar*dias
    tfiva=tara*1.06+(tfa-tara)*1.23 if pot<=3.45 else tfa*1.23
    cav=P['CAV']*dias/30*1.06
    return e*kwh*ivaE+tfiva+kwh*P['IEC']*1.23+cav
def get(d,id):
    return [o for o in d['ofertas'] if o['id']==id][0]

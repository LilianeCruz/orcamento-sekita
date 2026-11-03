"""API do Orçamento Sekita (tela de Arrendamentos)."""
from __future__ import annotations

from contextlib import asynccontextmanager
from pathlib import Path
from typing import Iterator, List, Optional

import sqlite3
from fastapi import Depends, FastAPI, Header, Request
from fastapi.responses import FileResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from . import db
from .servicos import areas as svc_areas
from .servicos import arrendamentos as svc
from .servicos import culturas as svc_cult
from .servicos import custos as svc_custos
from .servicos import capital_giro as svc_cg
from .servicos import transportadora as svc_tr
from .servicos import inicio as svc_inicio
from .servicos import orcado_realizado as svc_orcreal
from .servicos import realizado as svc_real
from .servicos import investimentos as svc_inv
from .servicos import captacoes as svc_cap
from .servicos import patrimonio as svc_pat
from .servicos import fluxo as svc_fluxo
from .servicos import demonstrativos as svc_demo
from .servicos import dividas as svc_div
from .servicos import anotacoes as svc_notas
from .servicos import balanco as svc_bp
from .servicos import dre as svc_dre
from .servicos import premissas_dem as svc_pd
from .servicos import grupos_custo as svc_grupos
from .servicos import precos as svc_precos
from .servicos import premissas as svc_prem
from .servicos import rebanho as svc_reb
from .servicos import dre_padrao as svc_dp
from .servicos import comparacao as svc_cmp
from .servicos import extras as svc_extras
from .servicos import pecuaria as svc_pec
from .servicos import produtividade as svc_prod
from .servicos import resultado as svc_res

WEB = Path(__file__).resolve().parent.parent / "web"

@asynccontextmanager
async def _lifespan(_: FastAPI):
    db.iniciar()
    yield


app = FastAPI(title="Orçamento Sekita", lifespan=_lifespan)


def conexao() -> Iterator[sqlite3.Connection]:
    con = db.conectar()
    try:
        yield con
        con.commit()
    except Exception:
        con.rollback()
        raise
    finally:
        con.close()


def autor(x_autor: Optional[str] = Header(default=None)) -> str:
    return (x_autor or "local").strip() or "local"


@app.middleware("http")
async def _sem_cache(request: Request, call_next):
    """Os arquivos da tela mudam com as atualizações: o navegador deve sempre conferir a versão atual."""
    resposta = await call_next(request)
    if not request.url.path.startswith("/api"):
        resposta.headers["Cache-Control"] = "no-cache"
    return resposta


@app.exception_handler(svc.Travada)
async def _travada(_: Request, e: svc.Travada) -> JSONResponse:
    return JSONResponse({"erro": str(e)}, status_code=409)


@app.exception_handler(svc.NaoEncontrado)
async def _nao_encontrado(_: Request, e: svc.NaoEncontrado) -> JSONResponse:
    return JSONResponse({"erro": str(e)}, status_code=404)


@app.exception_handler(svc.Invalido)
async def _invalido(_: Request, e: svc.Invalido) -> JSONResponse:
    return JSONResponse({"erro": str(e)}, status_code=422)


# ------------------------------------------------------------------ modelos
class NovaVersao(BaseModel):
    ano_base: Optional[int] = None
    nome: Optional[str] = None
    horizonte: int = svc.HORIZONTE
    data_inicio: Optional[str] = None     # AAAA-MM-DD; quando vem com data_fim, define ano_base e horizonte
    data_fim: Optional[str] = None


class PeriodoOrcIn(BaseModel):
    nome: str
    ano_inicial: int
    ano_final: int


class HorizonteIn(BaseModel):
    horizonte: int


class ReplicarFazendaIn(BaseModel):
    ano: int
    campos: List[str]


class ReplicarPrecoIn(BaseModel):
    cultura_id: int
    ano: int


class CopiaVersao(BaseModel):
    nome: Optional[str] = None
    tipo: str = "reprojetado"


class FazendaIn(BaseModel):
    nome: str
    tipo: str
    arrendador: str = ""
    forma: str = "reais"
    cultura_id: Optional[int] = None
    observacao: str = ""


class AnoIn(BaseModel):
    area_ha: float
    valor: float


class ParcelaIn(BaseModel):
    mes: int
    percentual: float


class GerarIn(BaseModel):
    n: int
    periodicidade: str
    mes_inicio: int


class CulturaIn(BaseModel):
    nome: str
    grupo: str
    unidade: str = "kg"
    embalagem: str = ""
    qtd_por_embalagem: float = 0
    ativa: bool = True
    receita_tipo: str = "operacional"       # operacional | nao_operacional
    estoque_destino: str = "produto"        # produto | gado


class AreaIn(BaseModel):
    area_ha: float


class ReplicarAreaIn(BaseModel):
    ano: int


class PrecoIn(BaseModel):
    cultura_id: int
    ano: int
    preco: float


# ------------------------------------------------------------------ versões
@app.get("/api/versoes")
def listar_versoes(con: sqlite3.Connection = Depends(conexao)):
    return svc.listar_versoes(con)


@app.post("/api/versoes")
def criar_versao(d: NovaVersao, con: sqlite3.Connection = Depends(conexao), a: str = Depends(autor)):
    return {"id": svc.criar_orcado(con, d.ano_base, d.nome, a, d.horizonte, d.data_inicio, d.data_fim)}


@app.post("/api/versoes/{vid}/copiar")
def copiar(vid: int, d: CopiaVersao, con: sqlite3.Connection = Depends(conexao), a: str = Depends(autor)):
    if d.tipo not in ("reprojetado", "revisao"):
        raise svc.Invalido("Tipo deve ser 'reprojetado' ou 'revisao'")
    return {"id": svc.copiar_versao(con, vid, d.tipo, d.nome, a)}


@app.put("/api/versoes/{vid}/periodo")
def periodo_orcamento(vid: int, d: PeriodoOrcIn, con: sqlite3.Connection = Depends(conexao), a: str = Depends(autor)):
    svc.alterar_periodo(con, vid, d.nome, d.ano_inicial, d.ano_final, a)
    return {"ok": True}


@app.put("/api/versoes/{vid}/horizonte")
def horizonte(vid: int, d: HorizonteIn, con: sqlite3.Connection = Depends(conexao), a: str = Depends(autor)):
    svc.alterar_horizonte(con, vid, d.horizonte, a)
    return {"ok": True}


@app.post("/api/versoes/{vid}/aprovar")
def aprovar(vid: int, con: sqlite3.Connection = Depends(conexao), a: str = Depends(autor)):
    svc.aprovar(con, vid, a)
    return {"ok": True}


@app.delete("/api/versoes/{vid}")
def excluir_versao(vid: int, con: sqlite3.Connection = Depends(conexao), a: str = Depends(autor)):
    svc.excluir_versao(con, vid, a)
    return {"ok": True}


# ------------------------------------------------------------------ arrendamentos
@app.get("/api/versoes/{vid}/arrendamentos")
def ler(vid: int, con: sqlite3.Connection = Depends(conexao)):
    dados = svc.ler(con, vid)
    dados["calculo"] = svc.calcular(con, vid)
    return dados


@app.post("/api/versoes/{vid}/fazendas")
def criar_fazenda(vid: int, d: FazendaIn, con: sqlite3.Connection = Depends(conexao), a: str = Depends(autor)):
    return {"id": svc.criar_fazenda(con, vid, d.model_dump(), a)}


@app.put("/api/fazendas/{fid}")
def atualizar_fazenda(fid: int, d: FazendaIn, con: sqlite3.Connection = Depends(conexao), a: str = Depends(autor)):
    svc.atualizar_fazenda(con, fid, d.model_dump(), a)
    return {"ok": True}


@app.delete("/api/fazendas/{fid}")
def excluir_fazenda(fid: int, con: sqlite3.Connection = Depends(conexao), a: str = Depends(autor)):
    svc.excluir_fazenda(con, fid, a)
    return {"ok": True}


@app.put("/api/fazendas/{fid}/anos/{ano}")
def salvar_ano(fid: int, ano: int, d: AnoIn, con: sqlite3.Connection = Depends(conexao), a: str = Depends(autor)):
    svc.salvar_ano(con, fid, ano, d.area_ha, d.valor, a)
    return {"ok": True}


@app.post("/api/fazendas/{fid}/replicar")
def replicar_fazenda(fid: int, d: ReplicarFazendaIn, con: sqlite3.Connection = Depends(conexao), a: str = Depends(autor)):
    return {"anos_alterados": svc.replicar_fazenda(con, fid, d.ano, d.campos, a)}


@app.put("/api/fazendas/{fid}/parcelas")
def salvar_parcelas(fid: int, d: List[ParcelaIn], con: sqlite3.Connection = Depends(conexao), a: str = Depends(autor)):
    svc.salvar_parcelas(con, fid, [p.model_dump() for p in d], a)
    return {"ok": True}


@app.post("/api/parcelas/gerar")
def gerar(d: GerarIn):
    """Só calcula; quem grava é o PUT de parcelas (assim o usuário pode editar antes)."""
    return svc.gerar_parcelas(d.n, d.periodicidade, d.mes_inicio)


class PrecoVendaIn(BaseModel):
    preco: float


@app.get("/api/versoes/{vid}/precos-venda")
def ler_precos_venda(vid: int, con: sqlite3.Connection = Depends(conexao)):
    return svc_precos.ler(con, vid)


@app.post("/api/versoes/{vid}/precos-venda/replicar-todas")
def replicar_todos_precos_venda(vid: int, d: ReplicarAreaIn, con: sqlite3.Connection = Depends(conexao), a: str = Depends(autor)):
    return svc_precos.replicar_todas(con, vid, d.ano, a)


@app.put("/api/versoes/{vid}/precos-venda/{cid}/{ano}")
def salvar_preco_venda(vid: int, cid: int, ano: int, d: PrecoVendaIn, con: sqlite3.Connection = Depends(conexao), a: str = Depends(autor)):
    svc_precos.salvar(con, vid, cid, ano, d.preco, a)
    return {"ok": True}


@app.post("/api/versoes/{vid}/precos-venda/{cid}/replicar")
def replicar_preco_venda(vid: int, cid: int, d: ReplicarAreaIn, con: sqlite3.Connection = Depends(conexao), a: str = Depends(autor)):
    return {"anos_alterados": svc_precos.replicar(con, vid, cid, d.ano, a)}


@app.get("/api/comparar-precos-venda")
def comparar_precos_venda(a: int, b: int, con: sqlite3.Connection = Depends(conexao)):
    return svc_precos.comparar(con, a, b)


@app.put("/api/versoes/{vid}/precos")
def salvar_precos(vid: int, d: List[PrecoIn], con: sqlite3.Connection = Depends(conexao), a: str = Depends(autor)):
    svc.salvar_precos(con, vid, [p.model_dump() for p in d], a)
    return {"ok": True}


@app.post("/api/versoes/{vid}/precos/replicar")
def replicar_preco(vid: int, d: ReplicarPrecoIn, con: sqlite3.Connection = Depends(conexao), a: str = Depends(autor)):
    return {"anos_alterados": svc.replicar_preco(con, vid, d.cultura_id, d.ano, a)}


@app.get("/api/comparar")
def comparar(a: int, b: int, con: sqlite3.Connection = Depends(conexao)):
    return svc.comparar(con, a, b)


# ------------------------------------------------------------------ culturas
@app.get("/api/culturas")
def listar_culturas(con: sqlite3.Connection = Depends(conexao)):
    return {"grupos": svc_cult.GRUPOS, "unidades": svc_cult.UNIDADES, "culturas": svc_cult.listar(con)}


@app.post("/api/culturas")
def criar_cultura(d: CulturaIn, con: sqlite3.Connection = Depends(conexao), a: str = Depends(autor)):
    return {"id": svc_cult.criar(con, d.model_dump(), a)}


@app.put("/api/culturas/{cid}")
def atualizar_cultura(cid: int, d: CulturaIn, con: sqlite3.Connection = Depends(conexao), a: str = Depends(autor)):
    svc_cult.atualizar(con, cid, d.model_dump(), a)
    return {"ok": True}


@app.delete("/api/culturas/{cid}")
def excluir_cultura(cid: int, con: sqlite3.Connection = Depends(conexao), a: str = Depends(autor)):
    svc_cult.excluir(con, cid, a)
    return {"ok": True}


# ------------------------------------------------------------------ áreas por cultura
@app.get("/api/versoes/{vid}/areas")
def ler_areas(vid: int, con: sqlite3.Connection = Depends(conexao)):
    return svc_areas.ler(con, vid)


class AdicionarCulturaIn(BaseModel):
    cultura_id: int


@app.post("/api/versoes/{vid}/areas/culturas")
def adicionar_cultura_area(vid: int, d: AdicionarCulturaIn, con: sqlite3.Connection = Depends(conexao), a: str = Depends(autor)):
    svc_areas.adicionar_cultura(con, vid, d.cultura_id, a)
    return {"ok": True}


@app.delete("/api/versoes/{vid}/areas/culturas/{cid}")
def remover_cultura_area(vid: int, cid: int, con: sqlite3.Connection = Depends(conexao), a: str = Depends(autor)):
    svc_areas.remover_cultura(con, vid, cid, a)
    return {"ok": True}


@app.post("/api/versoes/{vid}/areas/replicar-todas")
def replicar_todas_areas(vid: int, d: ReplicarAreaIn, con: sqlite3.Connection = Depends(conexao), a: str = Depends(autor)):
    return svc_areas.replicar_todas(con, vid, d.ano, a)


@app.put("/api/versoes/{vid}/areas/{cid}/{ano}")
def salvar_area(vid: int, cid: int, ano: int, d: AreaIn, con: sqlite3.Connection = Depends(conexao), a: str = Depends(autor)):
    svc_areas.salvar_area(con, vid, cid, ano, d.area_ha, a)
    return {"ok": True}


@app.post("/api/versoes/{vid}/areas/{cid}/replicar")
def replicar_area(vid: int, cid: int, d: ReplicarAreaIn, con: sqlite3.Connection = Depends(conexao), a: str = Depends(autor)):
    return {"anos_alterados": svc_areas.replicar(con, vid, cid, d.ano, a)}


@app.get("/api/comparar-areas")
def comparar_areas(a: int, b: int, con: sqlite3.Connection = Depends(conexao)):
    return svc_areas.comparar(con, a, b)


# ------------------------------------------------------------------ produtividade pecuária (leite)
class PecuariaValorIn(BaseModel):
    valor: float


class CulturaListaIn(BaseModel):
    cultura_id: int


@app.post("/api/versoes/{vid}/produtividade/culturas")
def incluir_cultura_produtividade(vid: int, d: CulturaListaIn, con: sqlite3.Connection = Depends(conexao), a: str = Depends(autor)):
    svc_extras.incluir(con, vid, "produtividade", d.cultura_id, a)
    return {"ok": True}


@app.delete("/api/versoes/{vid}/produtividade/culturas/{cid}")
def remover_cultura_produtividade(vid: int, cid: int, con: sqlite3.Connection = Depends(conexao), a: str = Depends(autor)):
    svc_extras.remover(con, vid, "produtividade", cid, a)
    return {"ok": True}


@app.post("/api/versoes/{vid}/precos-venda/culturas")
def incluir_cultura_precos(vid: int, d: CulturaListaIn, con: sqlite3.Connection = Depends(conexao), a: str = Depends(autor)):
    svc_extras.incluir(con, vid, "precos", d.cultura_id, a)
    return {"ok": True}


@app.delete("/api/versoes/{vid}/precos-venda/culturas/{cid}")
def remover_cultura_precos(vid: int, cid: int, con: sqlite3.Connection = Depends(conexao), a: str = Depends(autor)):
    svc_extras.remover(con, vid, "precos", cid, a)
    return {"ok": True}


@app.get("/api/versoes/{vid}/pecuaria")
def ler_pecuaria(vid: int, con: sqlite3.Connection = Depends(conexao)):
    return svc_pec.ler(con, vid)


@app.post("/api/versoes/{vid}/pecuaria/replicar-todos")
def replicar_todos_pecuaria(vid: int, d: ReplicarAreaIn, con: sqlite3.Connection = Depends(conexao), a: str = Depends(autor)):
    return svc_pec.replicar_todos(con, vid, d.ano, a)


@app.put("/api/versoes/{vid}/pecuaria/{campo}/{ano}")
def salvar_pecuaria(vid: int, campo: str, ano: int, d: PecuariaValorIn, con: sqlite3.Connection = Depends(conexao), a: str = Depends(autor)):
    svc_pec.salvar(con, vid, campo, ano, d.valor, a)
    return {"ok": True}


@app.post("/api/versoes/{vid}/pecuaria/{campo}/replicar")
def replicar_pecuaria(vid: int, campo: str, d: ReplicarAreaIn, con: sqlite3.Connection = Depends(conexao), a: str = Depends(autor)):
    return {"anos_alterados": svc_pec.replicar(con, vid, campo, d.ano, a)}


@app.get("/api/comparar-pecuaria")
def comparar_pecuaria(a: int, b: int, con: sqlite3.Connection = Depends(conexao)):
    return svc_pec.comparar(con, a, b)


# ------------------------------------------------------------------ produtividade
class ProdutividadeIn(BaseModel):
    valor: float


@app.get("/api/versoes/{vid}/produtividade")
def ler_produtividade(vid: int, con: sqlite3.Connection = Depends(conexao)):
    return svc_prod.ler(con, vid)


@app.post("/api/versoes/{vid}/produtividade/replicar-todas")
def replicar_todas_produtividades(vid: int, d: ReplicarAreaIn, con: sqlite3.Connection = Depends(conexao), a: str = Depends(autor)):
    return svc_prod.replicar_todas(con, vid, d.ano, a)


@app.put("/api/versoes/{vid}/produtividade/{cid}/{ano}")
def salvar_produtividade(vid: int, cid: int, ano: int, d: ProdutividadeIn, con: sqlite3.Connection = Depends(conexao), a: str = Depends(autor)):
    svc_prod.salvar(con, vid, cid, ano, d.valor, a)
    return {"ok": True}


@app.post("/api/versoes/{vid}/produtividade/{cid}/replicar")
def replicar_produtividade(vid: int, cid: int, d: ReplicarAreaIn, con: sqlite3.Connection = Depends(conexao), a: str = Depends(autor)):
    return {"anos_alterados": svc_prod.replicar(con, vid, cid, d.ano, a)}


@app.get("/api/comparar-produtividade")
def comparar_produtividade(a: int, b: int, con: sqlite3.Connection = Depends(conexao)):
    return svc_prod.comparar(con, a, b)


# ------------------------------------------------------------------ endividamento (base)
class VinculoIn(BaseModel):
    importacao_id: Optional[int] = None


@app.get("/api/dividas/importacoes")
def listar_importacoes(con: sqlite3.Connection = Depends(conexao)):
    return {"importacoes": svc_div.listar_importacoes(con), "arquivo_padrao": str(svc_div.ARQUIVO_PADRAO),
            "arquivo_padrao_existe": svc_div.ARQUIVO_PADRAO.exists()}


@app.post("/api/dividas/importar")
async def importar_dividas(request: Request, arquivo: str = "Endividamento alterado.xlsx", versao_id: Optional[int] = None,
                           con: sqlite3.Connection = Depends(conexao), a: str = Depends(autor)):
    """O arquivo vai no corpo da requisição (sem multipart)."""
    corpo = await request.body()
    if not corpo:
        raise svc.Invalido("Nenhum arquivo recebido")
    return svc_div.importar(con, corpo, arquivo, versao_id, a)


@app.post("/api/dividas/importar-padrao")
def importar_dividas_padrao(versao_id: Optional[int] = None, con: sqlite3.Connection = Depends(conexao), a: str = Depends(autor)):
    return svc_div.importar_arquivo_padrao(con, versao_id, a)


@app.put("/api/versoes/{vid}/divida-importacao")
def vincular_divida(vid: int, d: VinculoIn, con: sqlite3.Connection = Depends(conexao), a: str = Depends(autor)):
    svc_div.vincular(con, vid, d.importacao_id, a)
    return {"ok": True}


@app.get("/api/versoes/{vid}/dividas")
def resumo_dividas(vid: int, empresas: str = "agro", con: sqlite3.Connection = Depends(conexao)):
    return svc_div.resumo(con, vid, empresas)


@app.get("/api/versoes/{vid}/dividas/balanco")
def balanco_dividas(vid: int, empresas: str = "agro", con: sqlite3.Connection = Depends(conexao)):
    return svc_div.balanco(con, vid, empresas)


@app.get("/api/versoes/{vid}/dividas/resumo-mensal")
def resumo_mensal_dividas(vid: int, empresas: str = "agro", con: sqlite3.Connection = Depends(conexao)):
    return svc_div.mensal_por_ano(con, vid, empresas)


@app.get("/api/versoes/{vid}/dividas/contratos")
def contratos_dividas(vid: int, empresas: str = "agro", ano: Optional[int] = None, grupo: Optional[str] = None,
                      con: sqlite3.Connection = Depends(conexao)):
    return svc_div.contratos(con, vid, empresas, ano, grupo)


@app.get("/api/versoes/{vid}/dividas/mensal")
def mensal_dividas(vid: int, ano: int, empresas: str = "agro", con: sqlite3.Connection = Depends(conexao)):
    return svc_div.mensal(con, vid, ano, empresas)


# ------------------------------------------------------------------ custos variáveis (R$/ha por cultura, grupo e ano)
class GrupoNaCulturaIn(BaseModel):
    grupo_id: int


class CustoIn(BaseModel):
    valor: float


@app.get("/api/versoes/{vid}/custos")
def ler_custos(vid: int, con: sqlite3.Connection = Depends(conexao)):
    return svc_custos.ler(con, vid)


@app.post("/api/versoes/{vid}/custos/replicar-todos")
def replicar_todos_custos(vid: int, d: ReplicarAreaIn, con: sqlite3.Connection = Depends(conexao), a: str = Depends(autor)):
    return svc_custos.replicar_todos(con, vid, d.ano, a)


class CulturaNoCustoIn(BaseModel):
    cultura_id: int


@app.post("/api/versoes/{vid}/custos/culturas")
def adicionar_cultura_custo(vid: int, d: CulturaNoCustoIn, con: sqlite3.Connection = Depends(conexao), a: str = Depends(autor)):
    svc_custos.adicionar_cultura(con, vid, d.cultura_id, a)
    return {"ok": True}


@app.delete("/api/versoes/{vid}/custos/culturas/{cid}")
def remover_cultura_custo(vid: int, cid: int, con: sqlite3.Connection = Depends(conexao), a: str = Depends(autor)):
    svc_custos.remover_cultura(con, vid, cid, a)
    return {"ok": True}


@app.post("/api/versoes/{vid}/custos/grupos-todas")
def adicionar_grupo_a_todas_culturas(vid: int, d: GrupoNaCulturaIn, con: sqlite3.Connection = Depends(conexao), a: str = Depends(autor)):
    return svc_custos.adicionar_grupo_a_todas(con, vid, d.grupo_id, a)


@app.post("/api/versoes/{vid}/custos/{cid}/grupos")
def adicionar_grupo_custo(vid: int, cid: int, d: GrupoNaCulturaIn, con: sqlite3.Connection = Depends(conexao), a: str = Depends(autor)):
    svc_custos.adicionar_grupo(con, vid, cid, d.grupo_id, a)
    return {"ok": True}


@app.delete("/api/versoes/{vid}/custos/{cid}/grupos/{gid}")
def remover_grupo_custo(vid: int, cid: int, gid: int, con: sqlite3.Connection = Depends(conexao), a: str = Depends(autor)):
    svc_custos.remover_grupo(con, vid, cid, gid, a)
    return {"ok": True}


@app.put("/api/versoes/{vid}/custos/{cid}/{gid}/{ano}")
def salvar_custo(vid: int, cid: int, gid: int, ano: int, d: CustoIn, con: sqlite3.Connection = Depends(conexao), a: str = Depends(autor)):
    svc_custos.salvar(con, vid, cid, gid, ano, d.valor, a)
    return {"ok": True}


@app.post("/api/versoes/{vid}/custos/{cid}/{gid}/replicar")
def replicar_custo(vid: int, cid: int, gid: int, d: ReplicarAreaIn, con: sqlite3.Connection = Depends(conexao), a: str = Depends(autor)):
    return {"anos_alterados": svc_custos.replicar(con, vid, cid, gid, d.ano, a)}


@app.get("/api/comparar-custos")
def comparar_custos(a: int, b: int, con: sqlite3.Connection = Depends(conexao)):
    return svc_custos.comparar(con, a, b)


# ------------------------------------------------------------------ premissas de culturas
class TipoPremissaIn(BaseModel):
    tipo: str


@app.get("/api/versoes/{vid}/premissas")
def ler_premissas(vid: int, con: sqlite3.Connection = Depends(conexao)):
    return svc_prem.ler(con, vid)


@app.post("/api/versoes/{vid}/premissas/culturas")
def adicionar_cultura_premissa(vid: int, d: CulturaNoCustoIn, con: sqlite3.Connection = Depends(conexao), a: str = Depends(autor)):
    svc_prem.adicionar_cultura(con, vid, d.cultura_id, a)
    return {"ok": True}


@app.delete("/api/versoes/{vid}/premissas/culturas/{cid}")
def remover_cultura_premissa(vid: int, cid: int, con: sqlite3.Connection = Depends(conexao), a: str = Depends(autor)):
    svc_prem.remover_cultura(con, vid, cid, a)
    return {"ok": True}


@app.post("/api/versoes/{vid}/premissas/tipos-todas")
def adicionar_premissa_a_todas(vid: int, d: TipoPremissaIn, con: sqlite3.Connection = Depends(conexao), a: str = Depends(autor)):
    return svc_prem.adicionar_tipo_a_todas(con, vid, d.tipo, a)


@app.post("/api/versoes/{vid}/premissas/replicar-todas")
def replicar_todas_premissas(vid: int, d: ReplicarAreaIn, con: sqlite3.Connection = Depends(conexao), a: str = Depends(autor)):
    return svc_prem.replicar_todas(con, vid, d.ano, a)


@app.post("/api/versoes/{vid}/premissas/{cid}/tipos")
def adicionar_premissa(vid: int, cid: int, d: TipoPremissaIn, con: sqlite3.Connection = Depends(conexao), a: str = Depends(autor)):
    svc_prem.adicionar_tipo(con, vid, cid, d.tipo, a)
    return {"ok": True}


@app.delete("/api/versoes/{vid}/premissas/{cid}/tipos/{tipo}")
def remover_premissa(vid: int, cid: int, tipo: str, con: sqlite3.Connection = Depends(conexao), a: str = Depends(autor)):
    svc_prem.remover_tipo(con, vid, cid, tipo, a)
    return {"ok": True}


@app.put("/api/versoes/{vid}/premissas/{cid}/{tipo}/{ano}")
def salvar_premissa(vid: int, cid: int, tipo: str, ano: int, d: CustoIn, con: sqlite3.Connection = Depends(conexao), a: str = Depends(autor)):
    svc_prem.salvar(con, vid, cid, tipo, ano, d.valor, a)
    return {"ok": True}


@app.post("/api/versoes/{vid}/premissas/{cid}/{tipo}/replicar")
def replicar_premissa(vid: int, cid: int, tipo: str, d: ReplicarAreaIn, con: sqlite3.Connection = Depends(conexao), a: str = Depends(autor)):
    return {"anos_alterados": svc_prem.replicar(con, vid, cid, tipo, d.ano, a)}


@app.get("/api/comparar-premissas")
def comparar_premissas(a: int, b: int, con: sqlite3.Connection = Depends(conexao)):
    return svc_prem.comparar(con, a, b)


# ------------------------------------------------------------------ anotações (marca-texto e comentário nos números)
class AnotacaoIn(BaseModel):
    tela: str
    chave: str
    cor: str = ""
    comentario: str = ""
    valor: Optional[float] = None


@app.get("/api/versoes/{vid}/anotacoes")
def listar_anotacoes(vid: int, tela: str, con: sqlite3.Connection = Depends(conexao)):
    return svc_notas.listar(con, vid, tela)


@app.get("/api/versoes/{vid}/anotacoes/todas")
def listar_todas_anotacoes(vid: int, con: sqlite3.Connection = Depends(conexao)):
    return svc_notas.listar_todas(con, vid)


class ValidarIn(BaseModel):
    tela: str
    chave: str
    validado: bool = True


@app.post("/api/versoes/{vid}/anotacoes/validar")
def validar_anotacao(vid: int, d: ValidarIn, con: sqlite3.Connection = Depends(conexao), a: str = Depends(autor)):
    return svc_notas.validar(con, vid, d.tela, d.chave, d.validado, a)


@app.put("/api/versoes/{vid}/anotacoes")
def salvar_anotacao(vid: int, d: AnotacaoIn, con: sqlite3.Connection = Depends(conexao), a: str = Depends(autor)):
    return svc_notas.salvar(con, vid, d.tela, d.chave, d.cor, d.comentario, a, d.valor)


# ------------------------------------------------------------------ capital de giro (premissas digitáveis)
@app.get("/api/versoes/{vid}/capital-giro")
def ler_capital_giro(vid: int, con: sqlite3.Connection = Depends(conexao)):
    return svc_cg.ler(con, vid)


class AtualizarPrazosIn(BaseModel):
    anos: Optional[List[int]] = None


@app.get("/api/versoes/{vid}/capital-giro/previa-prazos")
def previa_prazos_capital_giro(vid: int, con: sqlite3.Connection = Depends(conexao)):
    return svc_cg.previa_prazos(con, vid)


@app.post("/api/versoes/{vid}/capital-giro/atualizar-prazos")
def atualizar_prazos_capital_giro(vid: int, d: Optional[AtualizarPrazosIn] = None, con: sqlite3.Connection = Depends(conexao), a: str = Depends(autor)):
    return svc_cg.atualizar_prazos(con, vid, a, d.anos if d else None)


@app.post("/api/versoes/{vid}/capital-giro/replicar-todos")
def replicar_todos_capital_giro(vid: int, d: ReplicarAreaIn, con: sqlite3.Connection = Depends(conexao), a: str = Depends(autor)):
    return svc_cg.replicar_todos(con, vid, d.ano, a)


@app.put("/api/versoes/{vid}/capital-giro/{campo}/{ano}")
def salvar_capital_giro(vid: int, campo: str, ano: int, d: PecuariaValorIn, con: sqlite3.Connection = Depends(conexao), a: str = Depends(autor)):
    svc_cg.salvar(con, vid, campo, ano, d.valor, a)
    return {"ok": True}


@app.post("/api/versoes/{vid}/capital-giro/{campo}/replicar")
def replicar_capital_giro(vid: int, campo: str, d: ReplicarAreaIn, con: sqlite3.Connection = Depends(conexao), a: str = Depends(autor)):
    return {"anos_alterados": svc_cg.replicar(con, vid, campo, d.ano, a)}


@app.get("/api/versoes/{vid}/inicio")
def ler_inicio(vid: int, con: sqlite3.Connection = Depends(conexao)):
    return svc_inicio.ler(con, vid)


# ------------------------------------------------------------------ premissas de transportadora
@app.get("/api/versoes/{vid}/transportadora")
def ler_transportadora(vid: int, con: sqlite3.Connection = Depends(conexao)):
    return svc_tr.ler(con, vid)


@app.post("/api/versoes/{vid}/transportadora/replicar-todos")
def replicar_todos_transportadora(vid: int, d: ReplicarAreaIn, con: sqlite3.Connection = Depends(conexao), a: str = Depends(autor)):
    return svc_tr.replicar_todos(con, vid, d.ano, a)


@app.put("/api/versoes/{vid}/transportadora/{campo}/{ano}")
def salvar_transportadora(vid: int, campo: str, ano: int, d: PecuariaValorIn, con: sqlite3.Connection = Depends(conexao), a: str = Depends(autor)):
    svc_tr.salvar(con, vid, campo, ano, d.valor, a)
    return {"ok": True}


@app.post("/api/versoes/{vid}/transportadora/{campo}/replicar")
def replicar_transportadora(vid: int, campo: str, d: ReplicarAreaIn, con: sqlite3.Connection = Depends(conexao), a: str = Depends(autor)):
    return {"anos_alterados": svc_tr.replicar(con, vid, campo, d.ano, a)}


@app.get("/api/comparar-capital-giro")
def comparar_capital_giro(a: int, b: int, con: sqlite3.Connection = Depends(conexao)):
    return svc_cg.comparar(con, a, b)


# ------------------------------------------------------------------ balanço patrimonial (somente leitura)
@app.get("/api/versoes/{vid}/balanco-patrimonial")
def ler_balanco_patrimonial(vid: int, con: sqlite3.Connection = Depends(conexao)):
    return svc_bp.ler(con, vid)


@app.get("/api/comparar-balanco-patrimonial")
def comparar_balanco_patrimonial(a: int, b: int, con: sqlite3.Connection = Depends(conexao)):
    return svc_bp.comparar(con, a, b)


# ------------------------------------------------------------------ premissas dos demonstrativos (DRE e Balanço)
class PremissaDemIn(BaseModel):
    nome: str
    demonstrativo: str
    conta_codigo: str = ""
    sinal: int = 1
    tipo: str = "valor"
    base_codigo: str = ""
    base_negativa: str = ""


class PremissaDemEditIn(BaseModel):
    nome: Optional[str] = None
    conta_codigo: Optional[str] = None
    sinal: Optional[int] = None
    base_codigo: Optional[str] = None
    base_negativa: Optional[str] = None


@app.get("/api/versoes/{vid}/premissas-dem")
def ler_premissas_dem(vid: int, con: sqlite3.Connection = Depends(conexao)):
    return svc_pd.ler(con, vid)


@app.post("/api/premissas-dem")
def criar_premissa_dem(d: PremissaDemIn, con: sqlite3.Connection = Depends(conexao), a: str = Depends(autor)):
    return {"id": svc_pd.criar(con, d.nome, d.demonstrativo, d.conta_codigo, d.sinal, a, d.tipo, d.base_codigo, d.base_negativa)}


@app.put("/api/premissas-dem/{pid}")
def editar_premissa_dem(pid: int, d: PremissaDemEditIn, con: sqlite3.Connection = Depends(conexao), a: str = Depends(autor)):
    svc_pd.editar(con, pid, d.nome, d.conta_codigo, d.sinal, a, d.base_codigo, d.base_negativa)
    return {"ok": True}


@app.delete("/api/premissas-dem/{pid}")
def excluir_premissa_dem(pid: int, con: sqlite3.Connection = Depends(conexao), a: str = Depends(autor)):
    svc_pd.excluir(con, pid, a)
    return {"ok": True}


class PremissaDemValorIn(BaseModel):
    valor: float


class ReplicarDemIn(BaseModel):
    ano: int
    demonstrativo: Optional[str] = None


@app.post("/api/versoes/{vid}/premissas-dem/replicar-todas")
def replicar_todas_premissas_dem(vid: int, d: ReplicarDemIn, con: sqlite3.Connection = Depends(conexao), a: str = Depends(autor)):
    return svc_pd.replicar_todas(con, vid, d.ano, a, d.demonstrativo)


@app.put("/api/versoes/{vid}/premissas-dem/{pid}/{ano}")
def salvar_premissa_dem(vid: int, pid: int, ano: int, d: PremissaDemValorIn, con: sqlite3.Connection = Depends(conexao), a: str = Depends(autor)):
    svc_pd.salvar_valor(con, vid, pid, ano, d.valor, a)
    return {"ok": True}


@app.post("/api/versoes/{vid}/premissas-dem/{pid}/replicar")
def replicar_premissa_dem(vid: int, pid: int, d: ReplicarAreaIn, con: sqlite3.Connection = Depends(conexao), a: str = Depends(autor)):
    return {"anos_alterados": svc_pd.replicar(con, vid, pid, d.ano, a)}


class PremissaDemItemIn(BaseModel):
    premissa_id: int


@app.post("/api/versoes/{vid}/premissas-dem/itens")
def incluir_premissa_dem(vid: int, d: PremissaDemItemIn, con: sqlite3.Connection = Depends(conexao), a: str = Depends(autor)):
    svc_pd.incluir(con, vid, d.premissa_id, a)
    return {"ok": True}


@app.delete("/api/versoes/{vid}/premissas-dem/itens/{pid}")
def remover_premissa_dem(vid: int, pid: int, con: sqlite3.Connection = Depends(conexao), a: str = Depends(autor)):
    svc_pd.remover(con, vid, pid, a)
    return {"ok": True}


@app.get("/api/comparar-premissas-dem")
def comparar_premissas_dem(a: int, b: int, con: sqlite3.Connection = Depends(conexao)):
    return svc_pd.comparar(con, a, b)


# ------------------------------------------------------------------ investimentos e desinvestimentos
class TipoInvIn(BaseModel):
    nome: str
    natureza: str
    conta_codigo: str
    classificacao_id: int
    carrega_saldo: bool = False
    ativo: bool = True
    vida_util: float = 0
    residual_pct: float = 0
    carencia: int = 0
    versao_id: Optional[int] = None     # ao cadastrar a partir de um orçamento: o tipo só entra nele se `adicionar`
    adicionar: bool = True



class ClassificacaoInvIn(BaseModel):
    nome: str


@app.get("/api/versoes/{vid}/investimentos")
def ler_investimentos(vid: int, con: sqlite3.Connection = Depends(conexao)):
    return svc_inv.ler(con, vid)


@app.post("/api/investimentos/classificacoes")
def criar_classificacao_inv(d: ClassificacaoInvIn, con: sqlite3.Connection = Depends(conexao), a: str = Depends(autor)):
    return {"id": svc_inv.criar_classificacao(con, d.nome, a)}


@app.post("/api/investimentos/tipos")
def criar_tipo_inv(d: TipoInvIn, con: sqlite3.Connection = Depends(conexao), a: str = Depends(autor)):
    return {"id": svc_inv.criar_tipo(con, d.model_dump(), a, d.versao_id, d.adicionar)}


@app.put("/api/investimentos/tipos/{tid}")
def editar_tipo_inv(tid: int, d: TipoInvIn, con: sqlite3.Connection = Depends(conexao), a: str = Depends(autor)):
    svc_inv.editar_tipo(con, tid, d.model_dump(), a)
    return {"ok": True}


class RebanhoIn(BaseModel):
    valor: float


class ComparacaoIn(BaseModel):
    base: int
    outros: List[int]
    ano: int
    itens: List[str]
    impactos: bool = True


@app.get("/api/comparacao/itens")
def itens_comparacao():
    return {"itens": svc_cmp.ITENS}


class ImpressaoIn(BaseModel):
    itens: List[str]


@app.post("/api/versoes/{vid}/impressao")
def imprimir_orcamento(vid: int, d: ImpressaoIn, con: sqlite3.Connection = Depends(conexao)):
    return svc_cmp.imprimir(con, vid, d.itens)


@app.post("/api/comparacao")
def comparar_orcamentos(d: ComparacaoIn, con: sqlite3.Connection = Depends(conexao), a: str = Depends(autor)):
    return svc_cmp.comparar(con, d.base, d.outros, d.ano, d.itens, d.impactos, a)


@app.get("/api/versoes/{vid}/dre-padrao")
def ler_dre_padrao(vid: int, con: sqlite3.Connection = Depends(conexao)):
    return svc_dp.ler(con, vid)


@app.get("/api/versoes/{vid}/dre-padrao/previa")
def previa_dre_padrao(vid: int, con: sqlite3.Connection = Depends(conexao)):
    return svc_dp.previa(con, vid)


@app.post("/api/versoes/{vid}/dre-padrao/atualizar")
def atualizar_dre_padrao(vid: int, d: Optional[AtualizarPrazosIn] = None, con: sqlite3.Connection = Depends(conexao), a: str = Depends(autor)):
    return svc_dp.atualizar(con, vid, a, d.anos if d else None)


@app.post("/api/versoes/{vid}/dre-padrao/replicar-todos")
def replicar_todos_dre_padrao(vid: int, d: ReplicarAreaIn, con: sqlite3.Connection = Depends(conexao), a: str = Depends(autor)):
    return svc_dp.replicar_todos(con, vid, d.ano, a)


@app.put("/api/versoes/{vid}/dre-padrao/{codigo}/{ano}")
def salvar_dre_padrao(vid: int, codigo: str, ano: int, d: RebanhoIn, con: sqlite3.Connection = Depends(conexao), a: str = Depends(autor)):
    svc_dp.salvar(con, vid, codigo, ano, d.valor, a)
    return {"ok": True}


@app.post("/api/versoes/{vid}/dre-padrao/{codigo}/replicar")
def replicar_dre_padrao(vid: int, codigo: str, d: ReplicarAreaIn, con: sqlite3.Connection = Depends(conexao), a: str = Depends(autor)):
    return {"anos_alterados": svc_dp.replicar(con, vid, codigo, d.ano, a)}


@app.get("/api/versoes/{vid}/rebanho")
def ler_rebanho(vid: int, con: sqlite3.Connection = Depends(conexao)):
    return svc_reb.ler(con, vid)


@app.put("/api/versoes/{vid}/rebanho/{cid}/{campo}/{ano}")
def salvar_rebanho(vid: int, cid: int, campo: str, ano: int, d: RebanhoIn, con: sqlite3.Connection = Depends(conexao), a: str = Depends(autor)):
    svc_reb.salvar(con, vid, cid, campo, ano, d.valor, a)
    return {"ok": True}


@app.post("/api/versoes/{vid}/rebanho/{cid}/{campo}/replicar")
def replicar_rebanho(vid: int, cid: int, campo: str, d: ReplicarAreaIn, con: sqlite3.Connection = Depends(conexao), a: str = Depends(autor)):
    return {"anos_alterados": svc_reb.replicar(con, vid, cid, campo, d.ano, a)}


@app.post("/api/versoes/{vid}/investimentos/{tid}/incluir")
def incluir_tipo_inv(vid: int, tid: int, con: sqlite3.Connection = Depends(conexao), a: str = Depends(autor)):
    svc_inv.incluir_na_versao(con, vid, tid, a)
    return {"ok": True}


@app.post("/api/versoes/{vid}/investimentos/{tid}/retirar")
def retirar_tipo_inv(vid: int, tid: int, con: sqlite3.Connection = Depends(conexao), a: str = Depends(autor)):
    svc_inv.retirar_da_versao(con, vid, tid, a)
    return {"ok": True}


@app.delete("/api/investimentos/tipos/{tid}")
def excluir_tipo_inv(tid: int, con: sqlite3.Connection = Depends(conexao), a: str = Depends(autor)):
    svc_inv.excluir_tipo(con, tid, a)
    return {"ok": True}


@app.post("/api/versoes/{vid}/investimentos/replicar-todos")
def replicar_todos_inv(vid: int, d: ReplicarAreaIn, con: sqlite3.Connection = Depends(conexao), a: str = Depends(autor)):
    return svc_inv.replicar_todos(con, vid, d.ano, a)


@app.put("/api/versoes/{vid}/investimentos/{tid}/{campo}/{ano}")
def salvar_investimento(vid: int, tid: int, campo: str, ano: int, d: PecuariaValorIn, con: sqlite3.Connection = Depends(conexao), a: str = Depends(autor)):
    svc_inv.salvar_valor(con, vid, tid, campo, ano, d.valor, a)
    return {"ok": True}


@app.post("/api/versoes/{vid}/investimentos/{tid}/{campo}/replicar")
def replicar_investimento(vid: int, tid: int, campo: str, d: ReplicarAreaIn, con: sqlite3.Connection = Depends(conexao), a: str = Depends(autor)):
    return {"anos_alterados": svc_inv.replicar(con, vid, tid, campo, d.ano, a)}


class DepreciacaoValorIn(BaseModel):
    valor: float


@app.put("/api/versoes/{vid}/depreciacao/{chave}/{ano}")
def salvar_depreciacao(vid: int, chave: str, ano: int, d: DepreciacaoValorIn, con: sqlite3.Connection = Depends(conexao), a: str = Depends(autor)):
    svc_inv.salvar_depreciacao(con, vid, chave, ano, d.valor, a)
    return {"ok": True}


@app.delete("/api/versoes/{vid}/depreciacao/{chave}")
def voltar_depreciacao(vid: int, chave: str, con: sqlite3.Connection = Depends(conexao), a: str = Depends(autor)):
    svc_inv.voltar_ao_calculado(con, vid, chave, a)
    return {"ok": True}


@app.get("/api/comparar-investimentos")
def comparar_investimentos(a: int, b: int, con: sqlite3.Connection = Depends(conexao)):
    return svc_inv.comparar(con, a, b)


# ------------------------------------------------------------------ fluxo de caixa, caixa de fechamento e dívida de giro automática
@app.get("/api/versoes/{vid}/fluxo-caixa")
def ler_fluxo_caixa(vid: int, con: sqlite3.Connection = Depends(conexao)):
    p = svc_fluxo.projetar(con, vid)                                       # o caixa é calculado uma vez e serve para o cálculo e para os demonstrativos
    return {**svc_fluxo.ler(con, vid, p), **{k: v for k, v in svc_demo.ler_fluxo(con, vid, p).items() if k != "estrutura"}}


@app.get("/api/versoes/{vid}/usos-fontes")
def ler_usos_fontes(vid: int, con: sqlite3.Connection = Depends(conexao)):
    return svc_demo.usos_fontes(con, vid)


@app.get("/api/versoes/{vid}/indicadores")
def ler_indicadores(vid: int, con: sqlite3.Connection = Depends(conexao)):
    return svc_demo.indicadores(con, vid)


@app.put("/api/versoes/{vid}/indicadores/{indicador}/{ano}")
def salvar_meta_indicador(vid: int, indicador: str, ano: int, d: DepreciacaoValorIn, con: sqlite3.Connection = Depends(conexao), a: str = Depends(autor)):
    svc_demo.salvar_meta(con, vid, indicador, ano, d.valor, a)
    return {"ok": True}


@app.post("/api/versoes/{vid}/indicadores/{indicador}/replicar")
def replicar_meta_indicador(vid: int, indicador: str, d: ReplicarAreaIn, con: sqlite3.Connection = Depends(conexao), a: str = Depends(autor)):
    return {"anos_alterados": svc_demo.replicar_meta(con, vid, indicador, d.ano, a)}


@app.put("/api/versoes/{vid}/fluxo-caixa/{campo}/{ano}")
def salvar_taxa_fluxo(vid: int, campo: str, ano: int, d: DepreciacaoValorIn, con: sqlite3.Connection = Depends(conexao), a: str = Depends(autor)):
    svc_fluxo.salvar_premissa(con, vid, campo, ano, d.valor, a)
    return {"ok": True}


@app.post("/api/versoes/{vid}/fluxo-caixa/{campo}/replicar")
def replicar_taxa_fluxo(vid: int, campo: str, d: ReplicarAreaIn, con: sqlite3.Connection = Depends(conexao), a: str = Depends(autor)):
    return {"anos_alterados": svc_fluxo.replicar_premissa(con, vid, campo, d.ano, a)}


# ------------------------------------------------------------------ patrimônio líquido (distribuição de lucros, aportes, ajustes)
@app.get("/api/versoes/{vid}/patrimonio")
def ler_patrimonio(vid: int, con: sqlite3.Connection = Depends(conexao)):
    return svc_pat.ler(con, vid)


@app.delete("/api/versoes/{vid}/patrimonio/{campo}")
def voltar_patrimonio(vid: int, campo: str, con: sqlite3.Connection = Depends(conexao), a: str = Depends(autor)):
    svc_pat.voltar_ao_calculado(con, vid, campo, a)
    return {"ok": True}


@app.post("/api/versoes/{vid}/patrimonio/replicar-todos")
def replicar_todos_patrimonio(vid: int, d: ReplicarAreaIn, con: sqlite3.Connection = Depends(conexao), a: str = Depends(autor)):
    return svc_pat.replicar_todos(con, vid, d.ano, a)


@app.put("/api/versoes/{vid}/patrimonio/{campo}/{ano}")
def salvar_patrimonio(vid: int, campo: str, ano: int, d: DepreciacaoValorIn, con: sqlite3.Connection = Depends(conexao), a: str = Depends(autor)):
    svc_pat.salvar(con, vid, campo, ano, d.valor, a)
    return {"ok": True}


@app.post("/api/versoes/{vid}/patrimonio/{campo}/replicar")
def replicar_patrimonio(vid: int, campo: str, d: ReplicarAreaIn, con: sqlite3.Connection = Depends(conexao), a: str = Depends(autor)):
    return {"anos_alterados": svc_pat.replicar(con, vid, campo, d.ano, a)}


@app.get("/api/comparar-patrimonio")
def comparar_patrimonio(a: int, b: int, con: sqlite3.Connection = Depends(conexao)):
    return svc_pat.comparar(con, a, b)


# ------------------------------------------------------------------ novas captações e financiamento dos investimentos
class CaptacaoIn(BaseModel):
    nome: str
    tipo: str
    ano: int
    valor: float
    taxa: float = 0
    prazo: int = 1
    carencia: int = 0


@app.get("/api/versoes/{vid}/captacoes")
def ler_captacoes(vid: int, con: sqlite3.Connection = Depends(conexao)):
    return svc_cap.ler(con, vid)


@app.post("/api/versoes/{vid}/captacoes")
def criar_captacao(vid: int, d: CaptacaoIn, con: sqlite3.Connection = Depends(conexao), a: str = Depends(autor)):
    return {"id": svc_cap.criar(con, vid, d.model_dump(), a)}


@app.put("/api/versoes/{vid}/captacoes/{cid}")
def editar_captacao(vid: int, cid: int, d: CaptacaoIn, con: sqlite3.Connection = Depends(conexao), a: str = Depends(autor)):
    svc_cap.editar(con, vid, cid, d.model_dump(), a)
    return {"ok": True}


@app.delete("/api/versoes/{vid}/captacoes/{cid}")
def excluir_captacao(vid: int, cid: int, con: sqlite3.Connection = Depends(conexao), a: str = Depends(autor)):
    svc_cap.excluir(con, vid, cid, a)
    return {"ok": True}


@app.put("/api/versoes/{vid}/cronograma-captacao/{chave}/{campo}/{ano}")
def salvar_cronograma_captacao(vid: int, chave: str, campo: str, ano: int, d: DepreciacaoValorIn, con: sqlite3.Connection = Depends(conexao), a: str = Depends(autor)):
    svc_cap.salvar_valor(con, vid, chave, campo, ano, d.valor, a)
    return {"ok": True}


@app.delete("/api/versoes/{vid}/cronograma-captacao/{chave}")
def voltar_cronograma_captacao(vid: int, chave: str, con: sqlite3.Connection = Depends(conexao), a: str = Depends(autor)):
    svc_cap.voltar_ao_calculado(con, vid, chave, a)
    return {"ok": True}


@app.put("/api/versoes/{vid}/financiamento/{campo}/{ano}")
def salvar_premissa_financiamento(vid: int, campo: str, ano: int, d: DepreciacaoValorIn, con: sqlite3.Connection = Depends(conexao), a: str = Depends(autor)):
    svc_cap.salvar_premissa(con, vid, campo, ano, d.valor, a)
    return {"ok": True}


@app.post("/api/versoes/{vid}/financiamento/{campo}/replicar")
def replicar_premissa_financiamento(vid: int, campo: str, d: ReplicarAreaIn, con: sqlite3.Connection = Depends(conexao), a: str = Depends(autor)):
    return {"anos_alterados": svc_cap.replicar_premissa(con, vid, campo, d.ano, a)}


@app.get("/api/comparar-captacoes")
def comparar_captacoes(a: int, b: int, con: sqlite3.Connection = Depends(conexao)):
    return svc_cap.comparar(con, a, b)


# ------------------------------------------------------------------ Realizado (Balanço e DRE de anos fechados)
@app.get("/api/realizado")
def ler_realizado(con: sqlite3.Connection = Depends(conexao)):
    return svc_real.ler(con)


@app.post("/api/realizado/importar")
async def importar_realizado(request: Request, arquivo: str = "realizado.xlsx", ano_inicial: Optional[int] = None, meses: Optional[int] = None, mes_inicio: Optional[int] = None, versao_id: Optional[int] = None,
                             quantidades: Optional[str] = None, con: sqlite3.Connection = Depends(conexao), a: str = Depends(autor)):
    corpo = await request.body()
    if not corpo:
        raise svc.Invalido("Nenhum arquivo recebido")
    q = None
    if quantidades is not None:                                     # "id:quantidade,id:quantidade" (quantidade vendida de cada produto no período)
        try:
            q = {int(k): float(v) for k, v in (x.split(":") for x in quantidades.split(",") if x)}
        except ValueError:
            raise svc.Invalido("Quantidades vendidas em formato inválido")
    return svc_real.importar(con, corpo, arquivo, a, ano_inicial, meses, mes_inicio, versao_id, q)


@app.get("/api/realizado/produtos")
def produtos_realizado(con: sqlite3.Connection = Depends(conexao)):
    return svc_real.produtos_venda(con)


class PeriodoRealizadoIn(BaseModel):
    mes_inicio: int
    mes_fim: int
    versao_id: Optional[int] = None


class QuantidadeRealizadoIn(BaseModel):
    quantidade: Optional[float] = None
    ano: Optional[int] = None


@app.get("/api/realizado/periodo")
def periodo_realizado(con: sqlite3.Connection = Depends(conexao)):
    return svc_real.periodo(con)


@app.put("/api/realizado/periodo")
def salvar_periodo_realizado(d: PeriodoRealizadoIn, con: sqlite3.Connection = Depends(conexao), a: str = Depends(autor)):
    svc_real.salvar_periodo(con, d.mes_inicio, d.mes_fim, d.versao_id, a)
    return {"ok": True}


@app.get("/api/realizado/quantidades")
def quantidades_realizado(con: sqlite3.Connection = Depends(conexao)):
    return svc_real.quantidades_por_ano(con)


@app.put("/api/realizado/quantidades/{cultura_id}")
def salvar_quantidade_realizado(cultura_id: int, d: QuantidadeRealizadoIn, con: sqlite3.Connection = Depends(conexao), a: str = Depends(autor)):
    svc_real.salvar_quantidade(con, cultura_id, d.quantidade, a, d.ano)
    return {"ok": True}


@app.get("/api/realizado/comparativo")
def comparativo_orcado_realizado(versao_id: int, ano: int, con: sqlite3.Connection = Depends(conexao)):
    return svc_orcreal.comparar(con, versao_id, ano)


@app.get("/api/realizado/importacoes")
def importacoes_realizado(con: sqlite3.Connection = Depends(conexao)):
    return svc_real.importacoes_comparaveis(con)


@app.get("/api/realizado/modelo")
def modelo_realizado(con: sqlite3.Connection = Depends(conexao)):
    return Response(svc_real.modelo(con), media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                    headers={"Content-Disposition": 'attachment; filename="modelo-realizado.xlsx"'})


@app.delete("/api/realizado/{ano}")
def excluir_realizado(ano: int, con: sqlite3.Connection = Depends(conexao), a: str = Depends(autor)):
    svc_real.excluir_ano(con, ano, a)
    return {"ok": True}


# ------------------------------------------------------------------ DRE (estrutura do Fechamento Contábil + valores por versão)
@app.post("/api/dre/importar")
async def importar_estrutura_dre(request: Request, arquivo: str = "fechamento-contabil.xlsx",
                                 con: sqlite3.Connection = Depends(conexao), a: str = Depends(autor)):
    corpo = await request.body()
    if not corpo:
        raise svc.Invalido("Nenhum arquivo recebido")
    return svc_dre.importar_estrutura(con, corpo, arquivo, a)


@app.post("/api/dre/importar-padrao")
def importar_estrutura_dre_padrao(con: sqlite3.Connection = Depends(conexao), a: str = Depends(autor)):
    return svc_dre.importar_arquivo_padrao(con, a)


@app.get("/api/dre/arquivo-padrao")
def arquivo_padrao_dre():
    return {"arquivo": str(svc_dre.ARQUIVO_PADRAO), "existe": svc_dre.ARQUIVO_PADRAO.exists()}


@app.get("/api/versoes/{vid}/dre")
def ler_dre(vid: int, con: sqlite3.Connection = Depends(conexao)):
    return svc_dre.ler(con, vid)


@app.get("/api/comparar-dre")
def comparar_dre(a: int, b: int, con: sqlite3.Connection = Depends(conexao)):
    return svc_dre.comparar(con, a, b)


# ------------------------------------------------------------------ resultado por cultura (somente leitura)
@app.get("/api/versoes/{vid}/resultado")
def ler_resultado(vid: int, con: sqlite3.Connection = Depends(conexao)):
    return svc_res.calcular(con, vid)


@app.get("/api/comparar-resultado")
def comparar_resultado(a: int, b: int, con: sqlite3.Connection = Depends(conexao)):
    return svc_res.comparar(con, a, b)


# ------------------------------------------------------------------ grupos de custos
class GrupoCustoIn(BaseModel):
    nome: str
    classificacao: str
    ativa: bool = True


@app.get("/api/grupos-custo")
def listar_grupos_custo(con: sqlite3.Connection = Depends(conexao)):
    return {"classificacoes": svc_grupos.CLASSIFICACOES, "grupos": svc_grupos.listar(con)}


@app.post("/api/grupos-custo")
def criar_grupo_custo(d: GrupoCustoIn, con: sqlite3.Connection = Depends(conexao), a: str = Depends(autor)):
    return {"id": svc_grupos.criar(con, d.model_dump(), a)}


@app.put("/api/grupos-custo/{gid}")
def atualizar_grupo_custo(gid: int, d: GrupoCustoIn, con: sqlite3.Connection = Depends(conexao), a: str = Depends(autor)):
    svc_grupos.atualizar(con, gid, d.model_dump(), a)
    return {"ok": True}


@app.delete("/api/grupos-custo/{gid}")
def excluir_grupo_custo(gid: int, con: sqlite3.Connection = Depends(conexao), a: str = Depends(autor)):
    svc_grupos.excluir(con, gid, a)
    return {"ok": True}


# ------------------------------------------------------------------ tela
@app.get("/")
def index():
    return FileResponse(WEB / "index.html")


app.mount("/web", StaticFiles(directory=WEB), name="web")

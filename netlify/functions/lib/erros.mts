// Erros de negócio: viram resposta JSON com o status certo (mesmos nomes do sistema em Python)
export class ErroHttp extends Error {
  constructor(public status: number, mensagem: string) { super(mensagem); }
}
export const Invalido = (m: string) => new ErroHttp(422, m);
export const NaoEncontrado = (m: string) => new ErroHttp(404, m);
export const Travada = (m: string) => new ErroHttp(409, m);

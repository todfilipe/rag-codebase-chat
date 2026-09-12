# Deploy

Produção corre numa VPS única e partilhada (`root@167.233.109.185`), atrás do domínio `reposeer.me`. Os dois serviços vivem num `docker compose` em `/root/rag-codebase-chat`. O `web` publica só em `127.0.0.1:3002`, e é o nginx do host que o expõe com TLS (`/etc/nginx/sites-available/reposeer.me`, gerido pelo certbot, com `proxy_buffering off` em `/api/query`). O `rag-service` não publica porta nenhuma: só o `web` lhe chega, pela rede interna do compose.

A VPS não é só deste projeto (finas, onebox e n8n correm ao lado). Qualquer porta nova verifica-se primeiro com `docker ps` e `ss -tln`.

## Onde se constroem as imagens

No GitHub Actions (`.github/workflows/deploy.yml`), nunca na VPS. Cada push para `main`:

1. corre `pytest` no `rag-service`, e `lint` e `vitest` no `web`;
2. se tudo passar, constrói as duas imagens e publica-as no GHCR com duas tags, `latest` e o SHA do commit:
   - `ghcr.io/todfilipe/rag-codebase-chat-rag-service`
   - `ghcr.io/todfilipe/rag-codebase-chat-web`

As variáveis `NEXT_PUBLIC_*` ficam **gravadas no JavaScript no momento do build**, por isso vivem como variáveis do repositório no GitHub (`gh variable list`) e não no `.env` da VPS. Mudar uma delas obriga a um build novo; reiniciar o container não chega.

O push **não** deploya. Pôr a imagem nova a correr é um passo manual, para nenhuma chave SSH de root desta VPS ficar guardada no GitHub.

## Deploy normal

```bash
git push origin main
gh run watch
ssh root@167.233.109.185
cd /root/rag-codebase-chat
git pull --ff-only
docker compose pull
docker compose up -d --no-build
```

O `git pull` continua a ser preciso: é ele que traz alterações ao `docker-compose.yml`. O `--no-build` é o que garante que a VPS nunca compila, mesmo que a imagem não exista (nesse caso falha, em vez de compilar com a RAM dos vizinhos).

Depois de cada deploy, confirmar de fora:

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://reposeer.me/
curl -s -o /dev/null -w "%{http_code}\n" --connect-timeout 6 http://167.233.109.185:8000/health
```

O primeiro tem de dar `200` e o segundo tem de dar timeout. Na VPS, `docker ps` tem de mostrar os vizinhos com o mesmo tempo de vida de antes do deploy.

## Rollback

Cada commit em `main` tem a sua imagem. Para voltar a um anterior:

```bash
IMAGE_TAG=<sha-do-commit> docker compose pull
IMAGE_TAG=<sha-do-commit> docker compose up -d --no-build
```

O próximo deploy sem `IMAGE_TAG` volta ao `latest`. O rollback não desfaz migrations do Supabase: se o commit problemático mudou o schema, a imagem antiga pode não bater certo com a base de dados.

## Arranque depois de um reboot

Não há nenhum script de arranque: é o Docker que trata disto.

- `docker.service` e `containerd.service` estão `enabled`, por isso o daemon arranca com a máquina. O `nginx.service` também.
- Os dois containers têm `restart: unless-stopped`. O daemon volta a levantar todos os que estavam a correr quando a máquina foi abaixo.
- **Exceção:** um container parado à mão (`docker compose stop` ou `down`) antes do reboot fica parado depois dele. Resolve-se com `docker compose up -d --no-build`.
- O `depends_on` com `service_healthy` só é respeitado pelo `docker compose up`, não pelo daemon no boot. Depois de um reboot, o `web` pode arrancar antes de o `rag-service` estar pronto, e os primeiros pedidos durante esses segundos recebem `502 rag_service_unavailable`.

Testado com um reboot real em 12-09-2026: SSH de volta 46 segundos depois de `systemctl reboot`, e os 9 containers da VPS (os deste projeto, finas, onebox e n8n) voltaram todos sozinhos. `reposeer.me` respondeu `200` e as portas `8000` e `3002` continuaram fechadas a partir do exterior.

Na VPS há um `pm2-root.service` enabled mas sem processos guardados (`dump.pm2` vazio). Nada deste projeto depende dele; se algum dia algo correr por pm2, só volta depois de um reboot se tiver sido feito `pm2 save`.

## Primeira instalação numa VPS nova

1. `git clone https://github.com/todfilipe/rag-codebase-chat.git /root/rag-codebase-chat`
2. Criar os três ficheiros de ambiente com `chmod 600`: `.env` na raiz (`WEB_PORT`, e as `NEXT_PUBLIC_*` para builds locais), `apps/web/.env.local` e `apps/rag-service/.env` (ver `docs/ENV.md`).
3. `docker login ghcr.io` com um token com `read:packages`, se os packages do GHCR forem privados.
4. Site do nginx com `proxy_pass http://127.0.0.1:3002`, `proxy_buffering off` em `/api/query`, e `certbot --nginx -d reposeer.me`.
5. `docker compose pull && docker compose up -d --no-build`.

## O que não fazer

- `docker compose up --build` na VPS: o `next build` compila com os 3,8 GB partilhados com os outros projetos.
- Publicar uma porta sem o prefixo `127.0.0.1:`. O Docker escreve as regras de iptables por cima da firewall, e a porta fica aberta à internet mesmo com o `ufw` a dizer o contrário.
- Guardar segredos em `vars` do GitHub ou em build args. Só as `NEXT_PUBLIC_*` vão no build, porque acabam de qualquer forma no browser.

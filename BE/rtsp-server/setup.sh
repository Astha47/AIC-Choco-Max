# download + extract (contoh versi; ganti versi bila perlu)
curl -L -o rtsp-simple-server.tar.gz \
  https://github.com/aler9/rtsp-simple-server/releases/download/v0.21.0/rtsp-simple-server_v0.21.0_linux_amd64.tar.gz
tar xzf rtsp-simple-server.tar.gz
# ./rtsp-simple-server &>/tmp/rtsp-server.log &
./rtsp-simple-server
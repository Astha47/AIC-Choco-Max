rtsp-simple-server packaging

This folder expects the `rtsp-simple-server` binary to be present at `./BE/rtsp-server/rtsp-simple-server`.

If the binary is not present, either:
- Download the binary from https://github.com/aler9/rtsp-simple-server/releases and place it here, or
- Build the binary and place it in this folder.

The Dockerfile will copy the binary into the image. If you prefer not to include the binary in the repo, the Dockerfile will still build but container startup will fail until the binary is provided.

Configuration file: `rtsp-simple-server.yml` is used for runtime configuration.

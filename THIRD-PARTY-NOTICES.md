WonderFilm — componentes de terceros

WonderFilm se distribuye bajo la Apache License 2.0 (fichero LICENSE del
repositorio). Electron, React, Zustand, Zod, Lucide y el SDK de Model Context
Protocol conservan sus propias licencias en los paquetes incluidos.

WonderFilm ejecuta FFmpeg y FFprobe como programas separados:

- FFmpeg 6.1.1 (essentials_build de www.gyan.dev), del paquete ffmpeg-static.
  Compilado con --enable-gpl --enable-version3. Su licencia (GPL v3) y su
  configuración de compilación acompañan al binario: ffmpeg.exe.LICENSE y
  ffmpeg.exe.README.
  Distribuidor del binario: https://www.gyan.dev/ffmpeg/builds/
- FFprobe 4.0.2, del paquete ffprobe-static. Compilado con --enable-gpl
  --enable-version3. El paquete no incluye el fichero de licencia del binario.

Quien redistribuya un instalador debe cumplir las licencias de estos binarios,
incluida la oferta del código fuente correspondiente cuando la exijan.

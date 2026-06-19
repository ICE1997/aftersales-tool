import ffmpegPath from 'ffmpeg-static'
export const FFMPEG: string | null = ffmpegPath ? ffmpegPath.replace('app.asar', 'app.asar.unpacked') : null

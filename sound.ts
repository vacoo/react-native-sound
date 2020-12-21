import * as React from "react-native"
import {EmitterSubscription, EventEmitter} from "react-native";

declare type AVAudioSessionCategory = 'Ambient' | 'SoloAmbient' | 'Playback' | 'Record' | 'PlayAndRecord' | 'AudioProcessing' | 'MultiRoute' | 'Alarm'
declare type AVAudioSessionMode = 'Default' | 'VoiceChat' | 'VideoChat' | 'GameChat' | 'VideoRecording' | 'Measurement' | 'MoviePlayback' | 'SpokenAudio'
declare type SoundBasePath = 'MAIN_BUNDLE' | 'DOCUMENT' | 'LIBRARY' | 'CACHES' | string

export interface SoundOptions {
  readonly rejectOnUnsupportedFeature?: boolean
  readonly enableSMTCIntegration?: boolean
}

export class Sound extends EventEmitter {
  protected readonly RNSound: any = React.NativeModules.RNSound
  private readonly MAIN_BUNDLE: string = this.RNSound.MainBundlePath
  private readonly DOCUMENT: string = this.RNSound.NSDocumentDirectory
  private readonly LIBRARY: string = this.RNSound.NSLibraryDirectory
  private readonly CACHES: string = this.RNSound.NSCachesDirectory
  protected readonly isAndroid: boolean = this.RNSound.IsAndroid
  protected readonly isWindows: boolean = this.RNSound.IsWindows
  protected isPlaying: boolean = false
  protected isLoaded: boolean = false
  private readonly basePath: string = ''
  private readonly _filename: string
  private readonly rejectOnUnsupportedFeature: boolean = false
  private key: number = 0
  private volume: number = 1
  private onPlaySubscription: EmitterSubscription | null = null
  private pan: number = 0
  private duration: number = -1
  private numberOfChannels: -1 | 1 | 2 = -1
  private numberOfLoops: number = 0
  private speed: number = 1

  constructor(filename: string, basePath?: SoundBasePath, options?: SoundOptions) {
    super()
    if(options?.rejectOnUnsupportedFeature) {
      this.rejectOnUnsupportedFeature = true
    }

    switch (basePath) {
      case "CACHES":
        this.basePath = this.CACHES
        break
      case "DOCUMENT":
        this.basePath = this.DOCUMENT
        break
      case "LIBRARY":
        this.basePath = this.LIBRARY
        break
      case "MAIN_BUNDLE":
        this.basePath = this.MAIN_BUNDLE
        break
    }

    // @ts-ignore
    const asset = React.Image.resolveAssetSource(filename)
    if(asset) {
      this._filename = asset.uri;
    } else {
      this._filename = this.basePath + '/' + filename

      if(this.isAndroid && !this.basePath && this.isRelativePath(filename)) {
        this._filename = filename.toLowerCase().replace(/\.[^.]+$/, '');
      }
    }

    this.RNSound.prepare(this._filename, this.key, options || {}, (error: any, props: { duration: any, numberOfChannels: any}) => {
      if(props) {
        if(typeof props.duration === 'number') {
          this.duration = props.duration
        }
        if([-1, 1, 2].includes(props.numberOfChannels)) {
          this.numberOfChannels = props.numberOfChannels
        }
      }

      if (error === null) {
        this.registerOnPlay().then(() => this.isLoaded = true)
      }

      if(error) {
        throw error
      }
    });
  }

  private isRelativePath(path: string): boolean {
    return !/^(\/|http(s?)|asset)/.test(path);
  }

  private async registerOnPlay(): Promise<void> {
    return new Promise((resolve, reject) => {
      if(!this.onPlaySubscription) {
        if(!this.isWindows) {
          this.onPlaySubscription = this.addListener(
            'onPlayChange',
            (param) => {
              const {isPlaying, playerKey} = param
              if (playerKey === this.key) {
                this.isPlaying = isPlaying
              }
            }
          )
        } else {
          if(this.rejectOnUnsupportedFeature) {
            reject('Cannot get system volume for ' + this._filename + ', this is an Android and iOS feature!')
          } else {
            resolve()
          }
        }
      }
    })
  }

  public async play(): Promise<any> {
    return new Promise((resolve, reject) => {
      !this.isLoaded
        ? reject(this._filename + 'is not yet ready!')
        : this.RNSound.play(this.key, (success: any) => {
          this.isPlaying = true
          resolve(success)
        })
    })
  }

  public async pause(): Promise<void> {
    return new Promise((resolve, reject) => {
      !this.isPlaying
        ? reject('Cannot pause ' + this._filename + ', which is currently not played!')
        : this.RNSound.pause(this.key, () => {
          this.isPlaying = false
          resolve()
        })
    })
  }

  public async stop(): Promise<void> {
    return new Promise<any>((resolve, reject) => {
      !this.isPlaying
        ? reject('Cannot stop ' + this._filename + ',  which is currently not played!')
        : this.RNSound.stop(this.key, () => {
          this.isPlaying = false
          resolve()
        })

    })
  }

  public async reset(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      if(this.isAndroid) {
        if(!this.isLoaded) {
          reject('Cannot reset ' + this._filename + ' which is not yet loaded!')
        } else {
          this.RNSound.reset(this.key)
          this.isPlaying = false
          resolve()
        }
      }
    })
  }

  public async release(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      if(this.isLoaded) {
        this.RNSound.release(this.key);
        this.isLoaded = false;
        if(!this.isWindows) {
          if(this.onPlaySubscription != null) {
            this.onPlaySubscription.remove();
            this.onPlaySubscription = null;
          }
        }
        resolve()
      } else {
        reject('Cannot release ' + this._filename + ', file is not loaded!')
      }
    })
  }

  public getDuration() {
    return this.duration
  }

  public getNumberOfChannels() {
    return this.numberOfChannels
  }

  public getVolume() {
    return this.volume
  }

  public async setVolume(volume: number): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      if(this.isLoaded) {
        if(volume < 0 || volume > 1) {
          reject('Volume must be a value between 0.0 and 1.0!')
          return
        }

        this.volume = volume
        if (this.isAndroid || this.isWindows) {
          this.RNSound.setVolume(this.key, volume, volume)
          resolve()
        } else {
          this.RNSound.setVolume(this.key, volume)
          resolve()
        }
      } else {
        reject('Cannot update ' + this._filename + 'volume, file not loaded!')
      }
    })
  }

  public getSystemVolume(): Promise<any> {
    return new Promise<any>((resolve, reject) => {
      if(!this.isWindows) {
        this.RNSound.getSystemVolume(resolve);
      } else {
        if(this.rejectOnUnsupportedFeature) {
          reject('Cannot get system volume for ' + this._filename + ', this is an Android and iOS feature!')
        } else {
          resolve()
        }
      }
    })
  }

  public setSystemVolume(volume: number): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      if(volume < 0 || volume > 1) {
        reject('System volume must be a value between 0.0 and 1.0!')
        return
      }

      if(this.isAndroid) {
        this.RNSound.setSystemVolume(volume)
        resolve()
      } else {
        if(this.rejectOnUnsupportedFeature) {
          reject('Cannot set system volume for ' + this._filename + ', this is an Android feature!')
        } else {
          resolve()
        }
      }
    })
  }

  public getPan(): number {
    return this.pan
  }

  public async setPan(pan: number): Promise<void> {
    return new Promise((resolve, reject) => {
      if(pan < -1 || pan > 1) {
        reject('Pan must be a value between -1.0 and 1.0!')
        return
      }

      if(this.isLoaded) {
        this.pan = pan
        this.RNSound.setPan(this.key, pan);
        resolve()
      } else {
        reject('Cannot set pan count for ' + this._filename + ', the file is not loaded!')
      }
    })
  }

  public getNumberOfLoops(): number {
    return this.numberOfLoops
  }

  public async setNumberOfLoops(loops: number): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.numberOfLoops = loops;
      if(this.isLoaded) {
        if(this.isAndroid || this.isWindows) {
          this.RNSound.setLooping(this.key, !!loops);
        } else {
          this.RNSound.setNumberOfLoops(this.key, loops);
        }
        resolve()
      } else {
        reject('Cannot set loop count for ' + this._filename + ', the file is not loaded!')
      }
    })
  }

  public async setSpeed(speed: number): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      if (this.isLoaded) {
        if(!this.isWindows && !this.isAndroid) {
          this.speed = speed
          this.RNSound.setSpeed(this.key, speed);
          resolve()
        } else {
          if(this.rejectOnUnsupportedFeature) {
            reject('Cannot set speed for ' + this._filename + ', this is an Android feature!')
          } else {
            resolve()
          }
        }
      } else {
        reject('Cannot set speed for ' + this._filename + ', the file is not loaded!')
      }
    })
  }

  public getCurrentSpeed(): number {
    return this.speed
  }

  public async getCurrentTime(): Promise<number> {
    return new Promise<number>((resolve) => {
      if(this.isLoaded) {
        this.RNSound.getCurrentTime(this.key, resolve);
      }
    })
  }

  public async setCurrentTime(time: number): Promise<void> {
    if(this.isLoaded) {
      this.RNSound.setCurrentTime(this.key, time)
    }
  }

// android only
  public async setSpeakerphoneOn(): Promise<void> {
    if (this.isAndroid) {
      return this.RNSound.setSpeakerphoneOn(this.key, true)
    }
  }

  public async setSpeakerphoneOff(): Promise<void> {
    if(this.isAndroid) {
      this.RNSound.setSpeakerphoneOn(this.key, false);
    }
  }

  public enable(): Promise<void> {
    return new Promise<void>((resolve) => {
      this.RNSound.enable(true)
      resolve()
    })
  }

  public disable(): Promise<void> {
    return new Promise<void>((resolve) => {
      this.RNSound.enable(false)
      resolve()
    })
  }

  public enableInSilenceMode() {
    return new Promise<void>((resolve, reject) => {
      if(!this.isAndroid && !this.isWindows) {
        this.RNSound.enableInSilenceMode(true);
        resolve()
      } else {
        if(this.rejectOnUnsupportedFeature) {
          reject('Cannot enable in silence mode for ' + this._filename + ', this is an iOS feature!')
        } else {
          resolve()
        }
      }
    })
  }

  public disableInSilenceMode() {
    return new Promise<void>((resolve, reject) => {
      if(!this.isAndroid && !this.isWindows) {
        this.RNSound.enableInSilenceMode(false);
        resolve()
      } else {
        if(this.rejectOnUnsupportedFeature) {
          reject('Cannot disable in silence mode for ' + this._filename + ', this is an iOS feature!')
        } else {
          resolve()
        }
      }
    })
  }


  public async setActive(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      if(!this.isAndroid && !this.isWindows) {
        this.RNSound.setActive(true)
        resolve()
      } else {
        if(this.rejectOnUnsupportedFeature) {
          reject('Cannot set active for ' + this._filename + ', this is an iOS feature!')
        } else {
          resolve()
        }
      }
    })
  }

  public async setInactive(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      if(!this.isAndroid && !this.isWindows) {
        this.RNSound.setActive(false)
        resolve()
      } else {
        if(this.rejectOnUnsupportedFeature) {
          reject('Cannot set inactive for ' + this._filename + ', this is an iOS feature!')
        } else {
          resolve()
        }
      }
    })
  }

  public async setCategory(category: AVAudioSessionCategory, mixWithOthers: boolean = false) {
    return new Promise<void>((resolve, reject) => {
      if(!this.isWindows) {
        this.RNSound.setCategory(category, mixWithOthers);
        resolve()
      } else {
        if(this.rejectOnUnsupportedFeature) {
          reject('Cannot set category for ' + this._filename + ', this is a Windows feature!')
        } else {
          resolve()
        }
      }
    })
  }

  public async setMode(mode: AVAudioSessionMode): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      if(!this.isAndroid && !this.isWindows) {
        this.RNSound.setMode(mode)
        resolve()
      } else {
        if(this.rejectOnUnsupportedFeature) {
          reject('Cannot set mode for ' + this._filename + ', this is an iOS feature!')
        } else {
          resolve()
        }
      }
    })
  }
}
/* eslint-disable eslint-comments/no-unlimited-disable */
/* eslint-disable*/
import React, { Component } from 'react';
import { View, ActivityIndicator, TouchableOpacity, Alert,Text } from 'react-native';
import { GiftedChat, Send, Message } from 'react-native-gifted-chat';
import { ChatManager, TokenProvider } from '@pusher/chatkit-client';
import axios from 'axios';
import Config from 'react-native-config';
import Icon from 'react-native-vector-icons/FontAwesome';
import  DocumentPicker  from 'react-native-document-picker';
import * as mime from 'react-native-mime-types';
import Modal from 'react-native-modal';
import ChatBubble from '../components/ChatBubble';
import AudioPlayer from '../components/AudioPlayer';
import VideoPlayer from '../components/VideoPlayer';
import {AudioRecorder, AudioUtils} from 'react-native-audio';
const CHATKIT_INSTANCE_LOCATOR_ID = `v1:us1:${Config.CHATKIT_INSTANCE_LOCATOR_ID}`;
const CHATKIT_SECRET_KEY = Config.CHATKIT_SECRET_KEY;
const CHATKIT_TOKEN_PROVIDER_ENDPOINT = `https://us1.pusherplatform.io/services/chatkit_token_provider/v1/868fb799-935c-4258-a9ed-61684eb99654/token`;

const CHAT_SERVER = "https://e46e4244.ngrok.io/rooms";

class Chat extends Component {

  static navigationOptions = ({ navigation }) => {
    const { params } = navigation.state;
    return {
      headerTitle: `Chat with ${params.friends_username}`
    };
  };

  state = {
    messages: [],
    is_initialized: false,
    is_picking_file: false,
    is_modal_visible: false,
    video_uri: null,
    currentTime: 0.0,
    recording: false,
    paused: false,
    stoppedRecording: false,
    finished: false,
    audioPath: AudioUtils.DocumentDirectoryPath + '/test.aac',
    hasPermission: undefined,
  };


  constructor(props) {
    super(props);
    const { navigation } = this.props;
    const user_id = navigation.getParam("user_id");
    const username = navigation.getParam("username");
    const friends_username = navigation.getParam("friends_username");

    const members = [username, friends_username];
    members.sort();

    this.user_id = user_id;
    this.username = username;
    this.room_name = members.join("-");
    this._record=this._record.bind(this)
    this._stop=this._stop.bind(this)
  }

  prepareRecordingPath(audioPath){
    AudioRecorder.prepareRecordingAtPath(audioPath, {
      SampleRate: 22050,
      Channels: 1,
      AudioQuality: "Low",
      AudioEncoding: "aac",
      AudioEncodingBitRate: 32000
    });
  }
  _renderButton(title, onPress, active) {
    var style = (active) ? styles.activeButtonText : styles.buttonText;

    return (
      <TouchableHighlight style={styles.button} onPress={onPress}>
        <Text style={style}>
          {title}
        </Text>
      </TouchableHighlight>
    );
  }

  _renderPauseButton(onPress, active) {
    var style = (active) ? styles.activeButtonText : styles.buttonText;
    var title = this.state.paused ? "RESUME" : "PAUSE";
    return (
      <TouchableHighlight style={styles.button} onPress={onPress}>
        <Text style={style}>
          {title}
        </Text>
      </TouchableHighlight>
    );
  }

  async _pause() {
    if (!this.state.recording) {
      console.warn('Can\'t pause, not recording!');
      return;
    }

    try {
      const filePath = await AudioRecorder.pauseRecording();
      this.setState({paused: true});
    } catch (error) {
      console.error(error);
    }
  }

  async _resume() {
    if (!this.state.paused) {
      console.warn('Can\'t resume, not paused!');
      return;
    }

    try {
      await AudioRecorder.resumeRecording();
      this.setState({paused: false});
    } catch (error) {
      console.error(error);
    }
  }

  async _stop() {
    if (!this.state.recording) {
      console.warn('Can\'t stop, not recording!');
      return;
    }

    this.setState({stoppedRecording: true, recording: false, paused: false});

    try {
      const filePath = await AudioRecorder.stopRecording();

      if (Platform.OS === 'android') {
        this._finishRecording(true, filePath);
      }
      return filePath;
    } catch (error) {
      console.error(error);
    }
  }

  async _play() {
    if (this.state.recording) {
      await this._stop();
    }

    // These timeouts are a hacky workaround for some issues with react-native-sound.
    // See https://github.com/zmxv/react-native-sound/issues/89.
    setTimeout(() => {
      var sound = new Sound(this.state.audioPath, '', (error) => {
        if (error) {
          console.log('failed to load the sound', error);
        }
      });

      setTimeout(() => {
        sound.play((success) => {
          if (success) {
            console.log('successfully finished playing');
          } else {
            console.log('playback failed due to audio decoding errors');
          }
        });
      }, 100);
    }, 100);
  }

  async _record() {
    if (this.state.recording) {
      this._stop()
    }

    if (!this.state.hasPermission) {
      console.warn('Can\'t record, no permission granted!');
      return;
    }

    if(this.state.stoppedRecording){
      this.prepareRecordingPath(this.state.audioPath);
    }

    this.setState({recording: true, paused: false});

    try {
      this.prepareRecordingPath(this.state.audioPath);
      const filePath = await AudioRecorder.startRecording();
    } catch (error) {
      console.error(error);
    }
  }

  _finishRecording(didSucceed, filePath, fileSize) {
    this.setState({ finished: didSucceed });
    Alert.alert('Success',filePath)
    let obj = {
      uri:filePath,
      type:"audio/aac", // mime type
      name:'test.aac',
 file_type: mime.contentType(filePath)
    }
    this.attachment = obj
    this.onSend([])
    console.log(`Finished recording of duration ${this.state.currentTime} seconds at path: ${filePath} and size of ${fileSize || 0} bytes`);
  }
  async componentDidMount() {

    try {
      const chatManager = new ChatManager({
        instanceLocator: CHATKIT_INSTANCE_LOCATOR_ID,
        userId: this.user_id,
        tokenProvider: new TokenProvider({ url: CHATKIT_TOKEN_PROVIDER_ENDPOINT })
      });

      let currentUser = await chatManager.connect();
      this.currentUser = currentUser;

      const response = await axios.post(
        CHAT_SERVER,
        {
          user_id: this.user_id,
          room_name: this.room_name
        }
      );

      const room = response.data;

      this.room_id = room.id.toString();
      await this.currentUser.subscribeToRoom({
        roomId: this.room_id,
        hooks: {
          onMessage: this.onReceive
        }
      });

      this.setState({
        is_initialized: true
      });
      AudioRecorder.requestAuthorization().then((isAuthorised) => {
        this.setState({ hasPermission: isAuthorised });

        if (!isAuthorised) return;
        this.prepareRecordingPath(this.state.audioPath);

        AudioRecorder.onProgress = (data) => {
          this.setState({currentTime: Math.floor(data.currentTime)});
        };

        AudioRecorder.onFinished = (data) => {
          // Android callback comes in the form of a promise instead.
          if (Platform.OS === 'ios') {
            this._finishRecording(data.status === "OK", data.audioFileURL, data.audioFileSize);
          }
        };
      });

    } catch (err) {
      console.log("error with chat manager: ", err);
    }
  }


  onReceive = async (data) => {
    console.log('received message');
    const { message } = await this.getMessage(data);

    await this.setState((previousState) => ({
      messages: GiftedChat.append(previousState.messages, message)
    }));
  }


  onSend([message]) {
    let msg = {
      text: message?message.text:this.username,
      roomId: this.room_id
    };

    if (this.attachment) {
      const filename = this.attachment.name;
      const type = this.attachment.file_type;

      msg.attachment = {
        file: {
          uri: this.attachment.uri,
          type: type,
          name: `${filename}`
        },
        name: `${filename}`,
        type: this.attachment.type
      };
    }

    this.setState({
      is_sending: true
    });

    this.currentUser.sendMessage(msg).then(() => {
      this.attachment = null;

      this.setState({
        is_sending: false
      });
    });
  }


  renderSend = props => {
    if (this.state.is_sending) {
      return (
        <ActivityIndicator
          size="small"
          color="#0064e1"
          style={[styles.loader, styles.sendLoader]}
        />
      );
    }

    return <Send {...props} />;
  }


  getMessage = async ({ id, senderId, text, attachment, createdAt }) => {

    let msg_data = {
      _id: id,
      text: text,
      createdAt: new Date(createdAt),
      user: {
        _id: senderId,
        name: senderId,
        avatar: "https://png.pngtree.com/svg/20170602/0db185fb9c.png"
      },
      attachment
    };

    if (attachment && attachment.type === 'video') {
      Object.assign(msg_data, { video: attachment.link });
    }

    return {
      message: msg_data
    };
  }


  renderMessage = (msg) => {

    const { attachment } = msg.currentMessage;
    const renderBubble = (attachment && attachment.type === 'audio') ? this.renderPreview.bind(this, attachment.link) : null;
    const onLongPress = (attachment  && attachment.type === 'video') ? this.onLongPressMessageBubble.bind(this, attachment.link) : null;

    const modified_msg = {
      ...msg,
      renderBubble,
      onLongPress,
      videoProps: {
        paused: true
      }
    }

    return <Message {...modified_msg} />
  }

  //

  onLongPressMessageBubble = (link) => {
    this.setState({
      is_modal_visible: true,
      video_uri: link
    });
  }


  renderPreview = (uri, bubbleProps) => {
    const text_color = (bubbleProps.position == 'right') ? '#FFF' : '#000';
    const modified_bubbleProps = {
      ...bubbleProps
    };

    return (
      <ChatBubble {...modified_bubbleProps}>
        <AudioPlayer url={uri} />
      </ChatBubble>
    );
  }

  //


  render() {
    const { is_initialized, messages, video_uri } = this.state;

    return (
      <View style={styles.container}>
        {(!is_initialized) && (
          <ActivityIndicator
            size="small"
            color="#0064e1"
            style={styles.loader}
          />
        )}

        {is_initialized && (
          <GiftedChat
            messages={messages}
            onSend={messages => this.onSend(messages)}
            user={{
              _id: this.user_id
            }}
            renderActions={this.renderCustomActions}
            renderSend={this.renderSend}
            renderMessage={this.renderMessage}
          />
        )}

        <Modal isVisible={this.state.is_modal_visible}>
          <View style={styles.modal}>
            <TouchableOpacity onPress={this.hideModal}>
              <Icon name={"close"} size={20} color={"#FFF"} style={styles.close} />
              
            </TouchableOpacity>
            <VideoPlayer uri={video_uri} />
          </View>
        </Modal>
        <TouchableOpacity style={styles.fab}>
            <Icon name={"microphone"} onPress={this._record} size={20} color={"#FFF"} style={styles.text} />
          </TouchableOpacity>
      </View>
    );
  }

  //

  hideModal = () => {
    this.setState({
      is_modal_visible: false,
      video_uri: null
    });
  }

  //

  renderCustomActions = () => {
    if (!this.state.is_picking_file) {
      const icon_color = this.attachment ? "#0064e1" : "#808080";

      return (
        <View style={styles.customActionsContainer}>
          <TouchableOpacity onPress={this.openFilePicker}>
            <View style={styles.buttonContainer}>
              <Icon name="paperclip" size={23} color={icon_color} />
            </View>
          </TouchableOpacity>
        </View>
      );
    }

    return (
      <ActivityIndicator size="small" color="#0064e1" style={styles.loader} />
    );
  }

  //

  openFilePicker = async () => {
    await this.setState({
      is_picking_file: true
    });
    // DocumentPicker.pick({
    //   type: [DocumentPicker.types.audio],

    // }, (err, file) => {

    //   if (!err) {
    //     this.attachment = {
    //       name: file.name,
    //       uri: file.uri,
    //       type: file.type,
    //       file_type: mime.contentType(file.name)
    //     };

    //     Alert.alert("Success", "File attached!");
    //   }
    //   else{
    //     Alert.alert("Error", err);

    //   }
       await DocumentPicker.pick({
        type: [DocumentPicker.types.audio],
      }).then((res,err)=>{
        if(res)
        {
          let obj = {
            uri:res.uri,
            type:res.type, // mime type
            name:res.name,
       file_type: mime.contentType(res.name)
          }
          this.attachment = obj
        Alert.alert("Success", JSON.stringify(obj));
        }
        else{
        Alert.alert("Error", err);

        }
      });

    

      this.setState({
        is_picking_file: false
      });
  }

}


const styles = {
  container: {
    flex: 1
  },
  loader: {
    paddingTop: 20
  },
  sendLoader: {
    marginRight: 10,
    marginBottom: 10
  },
  customActionsContainer: {
    flexDirection: "row",
    justifyContent: "space-between"
  },
  buttonContainer: {
    padding: 10
  },
  modal: {
    flex: 1
  },
  close: {
    alignSelf:'center',
    marginBottom: 10
  },
  fab:{
    height: 50,
    width: 50,
    borderRadius: 200,
    position: 'absolute',
    bottom: "10%",
    alignSelf:"center",
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor:'royalblue',
  },
  text:{
    fontSize:30,
    color:'white'
  },
}

export default Chat;
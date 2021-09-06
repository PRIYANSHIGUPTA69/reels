import React, { useContext, useState, useEffect } from 'react'
import { AuthContext } from '../Contexts/AuthProvider';
import { makeStyles, Avatar, Container, CircularProgress, Modal, Backdrop, Fade, Button, TextField } from '@material-ui/core';
import PhotoCamera from '@material-ui/icons/PhotoCamera';
import { database, storage } from '../firebase';
import LikeIcon from '@material-ui/icons/Favorite';
import CommentIcon from '@material-ui/icons/ChatBubble';
import CommentModal from './CommentModal';
import uuid from 'react-uuid';
import HeaderBar from './HeaderBar';


export default function Feed() {
    const useStyles = makeStyles((theme) => ({
        root: {
            '& > *': {
                margin: theme.spacing(1),
                paddingLeft: "7%"
            },
        },
        input: {
            display: 'none',
        },
        feedContainer: {
            width: "100vw",
            // backgroundColor: "lightblue",
            marginTop: "5rem"
        },
        reelsContainer: {
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            marginTop: "3rem",
            gap: "7rem"
        },
        likeIcon: {
            fontSize: "x-large"
        },
        commentIcon: {
            fontSize: "x-large"
        },
        liked: {
            color: "#ff5252"
        },
        unliked: {
            color: "#f1f2f6"
        },
        videoContainer: {
            position: "relative",
            display: "flex"
        },
        circularLoader: {
            position: "absolute",
            top: "calc( 100% / 2 )"
        },
        videoActionsIconsContainer: {
            display: "flex",
            width: "7rem",
            justifyContent: "space-around"
        },
        modal: {
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
        },
        paper: {
            backgroundColor: theme.palette.background.paper,
            boxShadow: theme.shadows[5],
            padding: theme.spacing(2, 4, 3),
            width: "30vw",
            height: "35vh",
            borderRadius: "10px",
            textAlign: "center",
            outline: "none",
        },
        videoDescriptionSection: {
            position: "absolute",
            bottom: "1rem",
            left: "0.5rem",
            minHeight: "5rem",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-around",
        }
    }))
    let classes = useStyles();

    const [loading, setLoading] = useState(false);
    const [uploadFile, setUploadFile] = useState(null);
    const [user, setUser] = useState();
    const [pageLoading, setPageLoading] = useState(true);
    const [isLiked, setIsLiked] = useState(false);
    const [videos, setVideos] = useState([]);
    const [commentVideoObj, setCommentVideoObj] = useState(null);
    const [postComments, setPostComments] = useState([]);
    const [lastVisiblePost, setLastVisiblePost] = useState();
    const { currentUser } = useContext(AuthContext);
    const [open, setOpen] = useState(false);
    const [videoDescription, setVideoDescription] = useState("");

    // For Video description Modal - open and close 
    const handleOpen = () => {
        setOpen(true);
    };
    const handleClose = () => {
        setOpen(false);
        uploadNewPostInFirestore();
    };

    const handleInputFile = (e) => {
        e.preventDefault();
        let file = e?.target?.files[0];
       
        if (!file) {
            setUploadFile(null);
            return;
        }
        if (file.size / (1024 * 1024) > 20) {  // dont't upload large size file
            alert('Your file size is too large');
            setUploadFile(null);
            return;
        }

        setUploadFile(file);
        handleOpen();
    }

    const uploadNewPostInFirestore = () => { // 1. Upload
        const uploadFileTask = storage.ref(`/posts/${uuid()}`).put(uploadFile);
        setLoading(true);
        uploadFileTask.on('state_changed', progressFn, errorFn, successFn);

        function progressFn(snapshot) {
            const progress = snapshot.bytesTransferred / snapshot.totalBytes;
        }
        function errorFn() {
            console.log('Some error occured while video uploading...');
            setLoading(false);
            setVideoDescription("");
            return;
        }
        function successFn() {
            uploadFileTask.snapshot.ref.getDownloadURL()
                .then(async (url) => {
                    console.log(currentUser.uid , "uid")
                    let postObjStructure = {
                        comments: [],
                        likes: [],
                        url,
                        auid: currentUser.uid,
                        createdAt: database.getUserTimeStamp(),
                        videoDescription,
                    } 
                    
                    let postObj = await database.posts.add(postObjStructure);
                    let updatedUserPosts = user.postIds;
                    updatedUserPosts.push(postObj.id);
                    await database.users.doc(currentUser.uid).update({
                        postIds: updatedUserPosts
                    })

                    setLoading(false);
                    setVideoDescription("");
                })
        }
    }

    useEffect(async () => {
      console.log(currentUser)
        let dataObject = await database.users.doc(currentUser.uid).get();
        setUser(dataObject.data());
        setPageLoading(false);
    }, [])

   async function fetchPostsInBatches() {
        setLoading(true);

        let unsubscribe =
            await database.posts
                .orderBy("createdAt", "desc")
                .startAfter(lastVisiblePost)
                .limit(2)
                .onSnapshot(async snapshot => {
                    if (snapshot.docs.length === 0) {
                        setLastVisiblePost(null);
                        setLoading(false);
                        return;
                    }
                    let curVideos = snapshot.docs.map(doc => doc.data());
                    setLastVisiblePost(snapshot.docs[snapshot.docs.length - 1]);

                    // Extract videosURL from post collection and user's data from user collection
                    // ProfileImg of the author of the post(video)
                    let videosDataArrFromFireStore = [];
                    for (let i = 0; i < curVideos.length; i++) {
                        let { url: videoUrl, auid, likes, videoDescription } = curVideos[i];
                        let puid = snapshot.docs[i].id;
                        let userObject = await database.users.doc(auid).get();
                        let { profileImageURL: userProfileImageURL, username } = userObject.data();

                        // For likes, check if current user has liked the post\
                        
                        videosDataArrFromFireStore.push({
                            videoUrl,
                            userProfileImageURL,
                            username,
                            puid,
                            liked: likes.includes(currentUser.uid),
                            videoDescription,
                        });
                    }

                    setLoading(false);
                    // Set Received videos for further dispaly in feed
                    setVideos([...videos, ...videosDataArrFromFireStore]);
                })
    }
    useEffect(async () => {
        setLoading(true);
        let unsubscribe =
            await database.posts
                .orderBy("createdAt", "desc")
                .limit(3)
                .onSnapshot(async snapshot => {
                    if (lastVisiblePost) return;
                    let videos = snapshot.docs.map(doc => doc.data());

                    setLastVisiblePost(snapshot.docs[snapshot.docs.length - 1]);
                    let videosDataArrFromFireStore = [];
                    for (let i = 0; i < videos.length; i++) {
                        let { url: videoUrl, auid, likes, videoDescription } = videos[i];
                        let puid = snapshot.docs[i].id;
                        let userObject = await database.users.doc(auid).get();
                        let userProfileImageURL = userObject.data().profileImageURL
                        let username = userObject.data().username
                        console.log(userObject.data() , "data")
                        videosDataArrFromFireStore.push({
                            videoUrl,
                            userProfileImageURL,
                            username,
                            puid,
                            liked: likes.includes(currentUser.uid),
                            videoDescription
                        });
                    }

                    setLoading(false);
                    // Set Received videos for further dispaly in feed
                    setVideos(videosDataArrFromFireStore);
                })

        return unsubscribe;
    }, [])


    let scrollAndVideoActionObserver;
    let infiniteScrollObserver;

    useEffect(() => {
        let allPosts = document.querySelectorAll("video");
        let scrollAndVideoActionConditionObject = {
            root: null,
            threshold: "0.7"
        }
        let infiniteScrollConditionObject = {
            root: null,
            rootMargin: "0px",
            threshold: "1.0"
        }

        function scrollAndVideoActionCallback(entries) {
            entries.forEach(entry => {
                let post = entry.target
                post.play().then(() => {
                    if (entry.isIntersecting === false) post.pause();
                })
            })
    
        }
        function infiniteScrollCallback(entries) {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    fetchPostsInBatches();
                    infiniteScrollObserver.unobserve(entry.target);
                }
            })
        }

        if (scrollAndVideoActionObserver) scrollAndVideoActionObserver.disconnect();
        if (infiniteScrollObserver) infiniteScrollObserver.disonnect();
        scrollAndVideoActionObserver = new IntersectionObserver(scrollAndVideoActionCallback, scrollAndVideoActionConditionObject);
        infiniteScrollObserver = new IntersectionObserver(infiniteScrollCallback, infiniteScrollConditionObject);
        allPosts.forEach((post, idx) => {
            scrollAndVideoActionObserver.observe(post);
            if (idx === allPosts.length - 1) infiniteScrollObserver.observe(post);
        })
    }, [videos])


    const handleLiked = async (puid, liked) => {

        let postRef = await database.posts.doc(puid).get();
        let post = postRef.data();
        // Not yet Liked
        if (liked == false) {
            let likes = post.likes;
            database.posts.doc(puid).update({
                "likes": [...likes, currentUser.uid]
            })
            setIsLiked(true);
        }
        else {
            let likes = post.likes.filter(likedByUid => {
                return likedByUid !== currentUser.uid;
            })
            database.posts.doc(puid).update({
                "likes": likes
            })
            setIsLiked(false);
        }
    }

    const handleComment = async (videoObj) => {
        console.log(videoObj , "videoobj")
        setCommentVideoObj(videoObj);

        let unsubscribe = await database.comments.orderBy("createdAt", "desc").onSnapshot(async snapshot => {
            let comments = snapshot.docs.map(doc => doc.data());

            let commentsDataArrFromFirestore = [];
            for (let i = 0; i < comments.length; i++) {
                let { profileImageURL, description, username, puid } = comments[i];
                let cuid = snapshot.docs[i].id;
                commentsDataArrFromFirestore.push({ profileImageURL, description, username, puid, cuid });
            }

            commentsDataArrFromFirestore = commentsDataArrFromFirestore.filter((commentObj) => {
                return commentObj.puid === (videoObj ? videoObj.puid : "");
            })

            setPostComments(commentsDataArrFromFirestore);
        })
    }



    return (
        pageLoading == true ? <CircularProgress color="secondary" className={classes.circularLoader} /> :
            <>
                <HeaderBar loading={loading} setLoading={setLoading} user={user}></HeaderBar>
                <Modal
                    aria-labelledby="transition-modal-title"
                    aria-describedby="transition-modal-description"
                    className={classes.modal}
                    open={open}
                    onClose={handleClose}
                    closeAfterTransition
                    BackdropComponent={Backdrop}
                    BackdropProps={{
                        timeout: 500,
                    }}
                >
                    <Fade in={open}>
                        <div className={classes.paper}>
                            <h2
                                style={{
                                    fontFamily: "Quicksand, sans-serif",
                                }} >Bio-Description</h2>
                            <div>
                                <TextField
                                    id="outlined-basic"
                                    label="Put on that Bio.."
                                    variant="outlined"
                                    type="text"
                                    fullWidth
                                    color="secondary"
                                    style={{ marginBottom: "2rem" }}
                                    value={videoDescription}
                                    onChange={(e) => setVideoDescription(e.target.value)} />
                            </div>
                            <Button
                                id="smash_btn"
                                variant="outlined"
                                color="primary"
                                onClick={handleClose}>Add</Button>
                        </div>
                    </Fade>
                </Modal>
                <Container className={classes.feedContainer}>
                    <div>
                        <div className="uploadImage">
                            <div className={classes.root}>
                                <input accept="file" className={classes.input} id="icon-button-file" type="file"
                                    onChange={handleInputFile}
                                />
                                <label style={{ paddingLeft: "0" }} htmlFor="icon-button-file">
                                    <Button variant="outlined" color="secondary" component="span" disabled={loading} endIcon={<PhotoCamera />}>
                                        Upload
                                    </Button>
                                </label>
                            </div>
                        </div>
                    </div>
                    <div className={classes.reelsContainer}>
                        {videos.map((videoObj) => {
                            return (
                                <div className={classes.videoContainer } key={videoObj.puid}>
                                    <Video
                                        src={videoObj.videoUrl}
                                        id={videoObj.puid}
                                        userName={videoObj.username}>
                                    </Video>
                                    <div className={classes.videoDescriptionSection}>
                                        <div
                                            style={{
                                                padding: "0.5rem",
                                                color: "#ffffff",
                                                fontFamily: "Quicksand, sans-serif",
                                            }}>
                                            <span
                                                style={{
                                                    color: "#26de81",
                                                    backgroundColor: "#4b4b4b",
                                                    padding: "4px 8px",
                                                    borderRadius: "5px",
                                                    fontWeight: "bold",
                                                    fontSize: "small",
                                                }}><s>@{videoObj.username}</s></span>
                                            &emsp;{videoObj.videoDescription}
                                        </div>
                                        <div className={classes.videoActionsIconsContainer}>
                                            <Avatar alt="Profile" style={{ height: "1.5rem", width: "1.5rem" }} src={videoObj.userProfileImageURL} />
                                            <LikeIcon
                                                className={[classes.likeIcon, videoObj.liked ? classes.liked : classes.unliked]}
                                                onClick={() => handleLiked(videoObj.puid, videoObj.liked)}
                                            />
                                            <CommentIcon
                                                className={[classes.commentIcon, classes.unliked]}
                                                onClick={() => { handleComment(videoObj) }}
                                            />
                                        </div>
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                </Container>

                <CommentModal commentVideoObj={commentVideoObj} postComments={postComments} setCommentVideoObj={setCommentVideoObj} setLoading={setLoading} />
            </>
    );
}

function Video(props) {
    return (
        <>
            <video
                onClick={handlePostSound}
                muted={true}
                id={props.id}
                src={props.src}
                className="video"
                onEnded={onVideoEnd}>
            </video>
        </>
    )
}

function handlePostSound(e) {
    e.target.muted = !e.target.muted;
}

function onVideoEnd(e) {
    let nextVideoSiblingParent = e.target.parentElement.nextSibling;
    if (nextVideoSiblingParent) {
        let videoDimensions = nextVideoSiblingParent.children[0].getBoundingClientRect();
        window.scrollBy({
            top: videoDimensions.top,
            left: videoDimensions.left,
            behavior: 'smooth'
        })
    }
    
}
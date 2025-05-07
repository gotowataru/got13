import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// --- ★★★ 設定値 (これらの値を調整してください) ★★★ ---
const MAZE_MODEL_PATH = './models/map2.glb';         // 迷路モデルのパス (ユーザー指定)
const CHARACTER_BASE_MODEL_PATH = './models/idle.fbx'; // キャラクター表示用ベースモデル
const ANIMATION_PATHS = {
    idle: './models/idle.fbx',
    run: './models/run_02.fbx',
    kick: './models/kick.fbx'
};

// キャラクター設定値
const CHARACTER_INITIAL_POSITION = new THREE.Vector3(-1300, 0.05, 1400); // 初期位置 (ユーザー指定)
const CHARACTER_INITIAL_SCALE = 30;  // 大きさ (ユーザー指定)
const CHARACTER_SPEED = 150.0; // 移動速度 (ユーザー指定)
const CHARACTER_ROTATION_SPEED = Math.PI; // 回転速度 (ユーザー指定)

// 元モデルのおおよその基本サイズ（単位：Blenderユニット）を想定して設定
const BASE_CHARACTER_HEIGHT = 1.8;
const BASE_CHARACTER_RADIUS = 0.4;
const BASE_COLLISION_PADDING = 0.1;

// スケール適用後のワールドサイズを計算
const CHARACTER_HEIGHT = BASE_CHARACTER_HEIGHT * CHARACTER_INITIAL_SCALE;
const CHARACTER_RADIUS = BASE_CHARACTER_RADIUS * CHARACTER_INITIAL_SCALE;
const COLLISION_PADDING = BASE_COLLISION_PADDING * CHARACTER_INITIAL_SCALE;

// 迷路設定値
const MAZE_SCALE = 10; // 迷路全体のスケール (ユーザー指定)
const MAZE_Y_OFFSET = 0; // 迷路のY座標オフセット (ユーザー指定)

// メインカメラ設定値
const CAMERA_Y_OFFSET = 50; // キャラクターの頭上からの高さオフセット (ユーザー指定)
const CAMERA_OFFSET = new THREE.Vector3(0, 100, 200);   // カメラオフセット(ユーザー指定)
const CAMERA_FOLLOW_SPEED = 0.08; // カメラターゲット追従の滑らかさ (ユーザー指定)
const CAMERA_COLLISION_OFFSET = 5.0; // ★ カメラが壁から離れる距離 (ユーザー指定値を維持)
const DISTANCE_ADJUST_SPEED = 0.05;   // ★ カメラ距離補正の速さ (追加)
const CAMERA_CORRECTION_LERP_SPEED = 0.15; // ★ カメラ壁回避/距離補正のlerpスピード (追加)

// ミニマップ設定値 (追加)
const MINIMAP_ENABLED = true;
const MINIMAP_SIZE_PX = 300;     // ミニマップの画面上のサイズ（ピクセル） (調整)
const MINIMAP_MARGIN_PX = 20;    // 画面端からのマージン（ピクセル） (調整)
const MINIMAP_CAMERA_Y_OFFSET_FACTOR = 1.5; // 迷路の最大次元に対するカメラ高さの係数
const MINIMAP_INDICATOR_Y_OFFSET = 5; // ミニマップの床面からのインジケータの高さオフセット
const MINIMAP_INDICATOR_SIZE = CHARACTER_RADIUS * 10; // ミニマップ上のキャラクターインジケータの半径

// ★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★

// --- グローバル変数 ---
let scene, camera, renderer, clock, controls;
let world = { mazeModel: null, collidables: [] };
let character = {
    model: null, mixer: null, actions: {}, currentActionName: null,
    canPlayAction: true, moveDirection: new THREE.Vector3(),
    box: new THREE.Box3(),
    vectorForward: new THREE.Vector3(0, 0, 1),
    cameraDirection: new THREE.Vector3()
};
let inputManager = {
    keys: {},
    isKeyPressed: function(key) {
        if (!key) return false;
        return this.keys[key.toLowerCase()] === true;
    }
};
const mainCameraRaycaster = new THREE.Raycaster(); // ★ カメラ衝突判定用 Raycaster (名称変更)

// ミニマップ用グローバル変数 (追加)
let minimapCamera;
let minimapCharacterIndicator;

// --- 初期化処理 ---
function init() {
    clock = new THREE.Clock();
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x6699cc); // 背景色変更
    scene.fog = new THREE.Fog(0x6699cc, 800 * MAZE_SCALE, 2500 * MAZE_SCALE); // 霧調整

    // --- メインカメラ ---
    camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 1, 5000 * MAZE_SCALE); // Far調整
    // メインカメラはデフォルトレイヤー(0)のみを表示
    camera.layers.set(0);

    // --- レンダラー ---
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    document.body.appendChild(renderer.domElement);

    // --- カメラコントロール (OrbitControls) ---
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.maxDistance = 3000 * MAZE_SCALE; // スケール反映
    // controls.enableZoom = false; // 必要ならズーム禁止
    // controls.enablePan = false; // 必要ならパン禁止

    // --- ライト ---
    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x8d8d8d, 1.8); // 光量調整
    hemiLight.position.set(0, 250 * MAZE_SCALE, 0); // スケール反映
    scene.add(hemiLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 2.2); // 光量調整
    dirLight.position.set(150 * MAZE_SCALE, 350 * MAZE_SCALE, 200 * MAZE_SCALE); // スケール反映
    dirLight.castShadow = true;
    const shadowCamSize = 2000 * MAZE_SCALE;
    dirLight.shadow.camera.top = shadowCamSize;
    dirLight.shadow.camera.bottom = -shadowCamSize;
    dirLight.shadow.camera.left = -shadowCamSize;
    dirLight.shadow.camera.right = shadowCamSize;
    dirLight.shadow.camera.near = 10;
    dirLight.shadow.camera.far = 1000 * MAZE_SCALE; // far調整
    dirLight.shadow.mapSize.width = 2048; // 解像度アップ
    dirLight.shadow.mapSize.height = 2048;
    dirLight.shadow.bias = -0.001;
    scene.add(dirLight);
    scene.add(dirLight.target);

    // --- 地面 ---
    const groundSize = 5000 * MAZE_SCALE; // スケール反映
    const groundGeometry = new THREE.PlaneGeometry(groundSize, groundSize);
    const groundMaterial = new THREE.MeshPhongMaterial({ color: 0x778899, depthWrite: false }); // 色変更
    const groundMesh = new THREE.Mesh(groundGeometry, groundMaterial);
    groundMesh.rotation.x = -Math.PI / 2;
    groundMesh.receiveShadow = true;
    groundMesh.position.y = 0;
    scene.add(groundMesh);
    // console.log("地面を作成しました。 Y=0"); // console.logは維持

    // --- ミニマップ関連の初期化 (修正) ---
    if (MINIMAP_ENABLED) {
        minimapCamera = new THREE.OrthographicCamera(-100, 100, 100, -100, 0.1, 3000 * MAZE_SCALE);
        minimapCamera.up.set(0, 0, -1); // ワールドの-Zがミニマップの上
        scene.add(minimapCamera);
        
        // ミニマップカメラはすべてのレイヤーを表示
        minimapCamera.layers.enableAll();

        const indicatorGeo = new THREE.ConeGeometry(MINIMAP_INDICATOR_SIZE, MINIMAP_INDICATOR_SIZE * 1.5, 4);
        indicatorGeo.translate(0, MINIMAP_INDICATOR_SIZE * 0.75, 0);
        indicatorGeo.rotateX(Math.PI / 2);
        const indicatorMat = new THREE.MeshBasicMaterial({ color: 0xff0000, depthTest: true });
        minimapCharacterIndicator = new THREE.Mesh(indicatorGeo, indicatorMat);
        scene.add(minimapCharacterIndicator);
        
        // インジケーターをミニマップ専用レイヤー(1)に設定
        minimapCharacterIndicator.layers.set(1);
    }

    setupInputListeners();
    loadAssetsAndSetup();
    window.addEventListener('resize', onWindowResize);
}

// --- 入力リスナー設定 ---
function setupInputListeners() { // (ユーザー提供版と同じ)
    document.addEventListener('keydown', (e) => inputManager.keys[e.key.toLowerCase()] = true);
    document.addEventListener('keyup', (e) => {
        inputManager.keys[e.key.toLowerCase()] = false;
    });
}

// --- アセット読み込みとセットアップ ---
async function loadAssetsAndSetup() { // (ミニマップカメラ設定を追加)
    const gltfLoader = new GLTFLoader();
    const fbxLoader = new FBXLoader();
    const loadingPromises = [];
    const loadedAnimations = {};

    console.log("アセット読み込み開始...");

    // 1. 迷路モデル(GLB)の読み込み (ユーザー提供版と同じ)
    loadingPromises.push(
        gltfLoader.loadAsync(MAZE_MODEL_PATH).then(gltf => {
            world.mazeModel = gltf.scene;
            world.mazeModel.scale.setScalar(MAZE_SCALE);
            world.mazeModel.position.y = MAZE_Y_OFFSET;
            scene.add(world.mazeModel);
            world.mazeModel.traverse(child => {
                if (child.isMesh) {
                    child.castShadow = true;
                    child.receiveShadow = true;
                    if (child.name.toLowerCase().includes('wall')) {
                        world.collidables.push(child);
                    }
                }
            });
            console.log(`迷路モデル読み込み完了。衝突候補 ${world.collidables.length} 個`);
            if (world.collidables.length === 0) console.warn("警告: 衝突判定用の壁 ('wall' を名前に含むオブジェクト) が見つかりません。");
        }).catch(e => { console.error(`迷路(${MAZE_MODEL_PATH})読込エラー:`, e); throw e; })
    );

    // 2. キャラクターベースモデル(FBX)の読み込み (ユーザー提供版と同じ)
    loadingPromises.push(
        fbxLoader.loadAsync(CHARACTER_BASE_MODEL_PATH).then(object => {
            character.model = object;
            character.model.scale.setScalar(CHARACTER_INITIAL_SCALE);
            character.model.position.copy(CHARACTER_INITIAL_POSITION);
            scene.add(character.model);
            character.model.traverse(child => { if (child.isMesh) { child.castShadow = true; child.receiveShadow = true; }});
            console.log("キャラクターベースモデル読み込み完了。");
        }).catch(e => { console.error(`キャラベース(${CHARACTER_BASE_MODEL_PATH})読込エラー:`, e); throw e; })
    );

    // 3. アニメーションファイル(FBX)の読み込み (ユーザー提供版と同じ)
    for (const name in ANIMATION_PATHS) {
        const path = ANIMATION_PATHS[name];
        loadingPromises.push(
            fbxLoader.loadAsync(path).then(object => {
                if (object.animations && object.animations.length > 0) {
                    loadedAnimations[name] = object.animations[0];
                    console.log(`アニメ ${name} 読み込み完了`);
                } else { console.warn(`${path} にアニメ無し (${name})`); }
            }).catch(e => { console.error(`アニメ ${name}(${path})読込エラー:`, e); })
        );
    }

    // --- 全てのアセット読み込み完了後 ---
    try {
        await Promise.all(loadingPromises);
        console.log("全てのアセット読み込み試行完了。");

        // キャラクターアニメーション設定 (ユーザー提供版と同じ)
        if (character.model && loadedAnimations.idle) {
            character.mixer = new THREE.AnimationMixer(character.model);
            for (const name in loadedAnimations) {
                const clip = loadedAnimations[name];
                if (clip) {
                    character.actions[name] = character.mixer.clipAction(clip);
                    if (name === 'idle' || name === 'run') {
                        character.actions[name].setLoop(THREE.LoopRepeat);
                    } else {
                        character.actions[name].setLoop(THREE.LoopOnce);
                        character.actions[name].clampWhenFinished = true;
                    }
                }
            }
            character.currentActionName = 'idle';
            if (character.actions.idle) character.actions.idle.play(); // 念のため存在確認
            console.log("キャラクターアニメーション設定完了。");
            character.mixer.addEventListener('finished', onAnimationFinished);
        } else {
            console.error("キャラクターモデルまたはアイドルアニメーションが読み込めていないため、アニメーションを設定できません。");
        }

        // メインカメラ初期視点設定 (ユーザー提供版と同じ)
        if (character.model && controls) {
            console.log("キャラクター位置基準でカメラ初期視点を設定。");
            const initialTarget = character.model.position.clone().add(new THREE.Vector3(0, CAMERA_Y_OFFSET, 0));
            controls.target.copy(initialTarget);
            const initialPosition = initialTarget.clone().add(CAMERA_OFFSET);
            camera.position.copy(initialPosition);
            controls.update();
            console.log("メインカメラ初期視点設定完了。");
        } else {
            console.error("メインカメラ初期視点を設定できません。");
            controls.target.set(0, 50, 0); camera.position.set(0, 150, 350); controls.update();
        }

        // ミニマップカメラ設定 (追加)
        if (MINIMAP_ENABLED && world.mazeModel && minimapCamera && minimapCharacterIndicator) {
            const mazeBox = new THREE.Box3().setFromObject(world.mazeModel);
            const mazeSize = mazeBox.getSize(new THREE.Vector3());
            const mazeCenter = mazeBox.getCenter(new THREE.Vector3());

            const maxMazeDim = Math.max(mazeSize.x, mazeSize.z) * 1.1; // 少しマージン
            minimapCamera.left = -maxMazeDim / 2;
            minimapCamera.right = maxMazeDim / 2;
            minimapCamera.top = maxMazeDim / 2;
            minimapCamera.bottom = -maxMazeDim / 2;
            
            minimapCamera.position.set(mazeCenter.x, mazeCenter.y + maxMazeDim * MINIMAP_CAMERA_Y_OFFSET_FACTOR, mazeCenter.z);
            minimapCamera.lookAt(mazeCenter.x, mazeCenter.y, mazeCenter.z); // 迷路の中心を見下ろす
            minimapCamera.updateProjectionMatrix();

            minimapCharacterIndicator.position.y = mazeCenter.y + MINIMAP_INDICATOR_Y_OFFSET; // Y位置も設定
            console.log("ミニマップカメラ設定完了。");
        }

        animate(); // アニメーションループ開始
    } catch (error) { // (ユーザー提供版のエラー表示を維持)
        console.error("アセット読み込みまたはセットアップ中に致命的なエラーが発生:", error);
        const errorDiv = document.createElement('div');
        errorDiv.textContent = 'エラー: アセットの読み込みに失敗しました。コンソールを確認してください。';
        errorDiv.style.cssText = 'position:absolute;top:10px;left:10px;padding:10px;background-color:red;color:white;z-index:1000;';
        document.body.appendChild(errorDiv);
    }
}

// --- アニメーション終了イベントハンドラ ---
function onAnimationFinished(event) { // (ユーザー提供版のコメントを維持)
    const finishedActionName = Object.keys(character.actions).find(name => character.actions[name] === event.action);
    if (finishedActionName && finishedActionName !== 'idle' && finishedActionName !== 'run') {
        console.log(`アクション終了: ${finishedActionName}`);
        character.canPlayAction = true;
    }
}

// --- アニメーション切り替え (フェード版に変更) ---
function switchAnimation(name) {
    if (!character.mixer || !character.actions[name] || character.currentActionName === name) return;
    const previousAction = character.actions[character.currentActionName];
    const nextAction = character.actions[name];
    character.currentActionName = name;

    if (previousAction) previousAction.fadeOut(0.2); // スムーズにフェードアウト
    nextAction.reset().setEffectiveTimeScale(1).setEffectiveWeight(1).fadeIn(0.2).play(); // スムーズにフェードイン
}

// --- 衝突判定 (キャラクター用 AABB) ---
function checkCollisions(movementVector) { // (ユーザー提供版と同じ)
    if (!character.model || world.collidables.length === 0) return movementVector;
    const charCenter = character.model.position.clone().add(new THREE.Vector3(0, CHARACTER_HEIGHT / 2, 0));
    const charSize = new THREE.Vector3(
        CHARACTER_RADIUS * 2 - COLLISION_PADDING * 2,
        CHARACTER_HEIGHT - COLLISION_PADDING,
        CHARACTER_RADIUS * 2 - COLLISION_PADDING * 2
    );
    character.box.setFromCenterAndSize(charCenter, charSize);
    const wallBox = new THREE.Box3();
    let collisionX = false;
    let collisionZ = false;
    let futureBoxX = character.box.clone().translate(new THREE.Vector3(movementVector.x, 0, 0));
    for (const wall of world.collidables) {
        wallBox.setFromObject(wall);
        if (futureBoxX.intersectsBox(wallBox)) { collisionX = true; break; }
    }
    let futureBoxZ = character.box.clone().translate(new THREE.Vector3(0, 0, movementVector.z));
    for (const wall of world.collidables) {
        wallBox.setFromObject(wall);
        if (futureBoxZ.intersectsBox(wallBox)) { collisionZ = true; break; }
    }
    const allowedMovement = movementVector.clone();
    if (collisionX) allowedMovement.x = 0;
    if (collisionZ) allowedMovement.z = 0;
    return allowedMovement;
}

// --- キャラクター更新 ---
function updateCharacter(delta) { // (ユーザー提供版と同じ)
    if (!character.model || !character.mixer) return;

    if (character.canPlayAction && inputManager.isKeyPressed(' ')) {
        switchAnimation('kick');
        character.canPlayAction = false;
    }

    const moveF = inputManager.isKeyPressed('w') || inputManager.isKeyPressed('arrowup');
    const moveB = inputManager.isKeyPressed('s') || inputManager.isKeyPressed('arrowdown');
    const moveL = inputManager.isKeyPressed('a') || inputManager.isKeyPressed('arrowleft');
    const moveR = inputManager.isKeyPressed('d') || inputManager.isKeyPressed('arrowright');
    const isTryingToMove = moveF || moveB || moveL || moveR;

    character.moveDirection.set(0, 0, 0);
    if (character.canPlayAction && isTryingToMove) {
        camera.getWorldDirection(character.cameraDirection);
        character.cameraDirection.y = 0;
        character.cameraDirection.normalize();
        const rightDirection = new THREE.Vector3().crossVectors(camera.up, character.cameraDirection).normalize();
        if (moveF) character.moveDirection.add(character.cameraDirection);
        if (moveB) character.moveDirection.sub(character.cameraDirection);
        if (moveL) character.moveDirection.add(rightDirection);
        if (moveR) character.moveDirection.sub(rightDirection);
        if (character.moveDirection.lengthSq() > 0) character.moveDirection.normalize();
        if (character.moveDirection.lengthSq() > 0.01) {
            const targetQuaternion = new THREE.Quaternion().setFromUnitVectors(character.vectorForward, character.moveDirection);
            // 回転速度調整 (CHARACTER_ROTATION_SPEED * 5 を掛ける)
            character.model.quaternion.slerp(targetQuaternion, CHARACTER_ROTATION_SPEED * delta * 5);
        }
    }

    const desiredMovement = character.moveDirection.clone().multiplyScalar(CHARACTER_SPEED * delta);
    let finalMovement = character.canPlayAction ? checkCollisions(desiredMovement) : new THREE.Vector3(0,0,0);
    character.model.position.add(finalMovement);

    const isActuallyMoving = finalMovement.lengthSq() > 0.0001;
    let targetAnimation = (isTryingToMove && isActuallyMoving) ? 'run' : 'idle';
    if (character.canPlayAction) switchAnimation(targetAnimation);

    character.mixer.update(delta);
}

// --- ウィンドウリサイズ処理 ---
function onWindowResize() { // (ユーザー提供版と同じ)
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}


// --- アニメーションループ (カメラ処理とミニマップ描画を追加・修正) ---
function animate() {

    // --- ▼▼▼ Canvasサイズ確認のためのログを追加 ▼▼▼ ---
    if (renderer) { // rendererが初期化されていることを確認
        console.log("Canvas実効サイズ: 幅=" + renderer.domElement.width + "px, 高さ=" + renderer.domElement.height + "px");
    }
    // --- ▲▲▲ Canvasサイズ確認のためのログを追加 ▲▲▲ ---
    
    
    requestAnimationFrame(animate);
    const delta = clock.getDelta();

    updateCharacter(delta);

    // --- メインカメラ制御 ---
    let idealCameraTargetPosition = null;
    let calculatedCameraPosition; // OrbitControls + 距離補正計算後の位置
    let collisionCorrectedCameraPosition = null; // 壁衝突補正後の目標位置

    const DESIRED_CAMERA_DISTANCE = CAMERA_OFFSET.length(); // 目標距離

    if (controls && character.model) {
        idealCameraTargetPosition = character.model.position.clone().add(new THREE.Vector3(0, CAMERA_Y_OFFSET, 0));
        controls.target.lerp(idealCameraTargetPosition, CAMERA_FOLLOW_SPEED);
        controls.update(); // OrbitControlsによる回転/ズームなどを反映

        // 望ましい距離への調整計算
        const currentDistance = camera.position.distanceTo(controls.target);
        const distanceError = DESIRED_CAMERA_DISTANCE - currentDistance;
        calculatedCameraPosition = camera.position.clone(); // OrbitControlsが計算した位置をベース

        if (Math.abs(distanceError) > 0.1) { // 許容誤差を超えたら調整目標を計算
            const directionToCamera = new THREE.Vector3().subVectors(camera.position, controls.target).normalize();
            if (directionToCamera.lengthSq() === 0) directionToCamera.set(0,0,1); // 同位置対策
            // 目標距離になるような位置を計算（ Lerp で使うのでここでは直接適用しない）
            calculatedCameraPosition.copy(controls.target).addScaledVector(directionToCamera, DESIRED_CAMERA_DISTANCE);
        }

        // --- メインカメラの壁衝突判定 ---
        const checkPosition = calculatedCameraPosition.clone(); // 距離調整「後」の位置を使う
        const directionFromTargetToCam = new THREE.Vector3().subVectors(checkPosition, idealCameraTargetPosition);
        let distTargetToCam = directionFromTargetToCam.length();

        if (distTargetToCam < 0.001) {
             distTargetToCam = CAMERA_COLLISION_OFFSET;
             directionFromTargetToCam.copy(CAMERA_OFFSET).normalize(); // 衝突回避できないのでデフォルト方向
        } else {
            directionFromTargetToCam.normalize();
        }

        mainCameraRaycaster.set(idealCameraTargetPosition, directionFromTargetToCam);
        mainCameraRaycaster.near = 0.1;
        mainCameraRaycaster.far = distTargetToCam;
        const intersects = mainCameraRaycaster.intersectObjects(world.collidables, false);

        if (intersects.length > 0) {
            const closestDistance = intersects[0].distance;
            // 壁から CAMERA_COLLISION_OFFSET の半分だけ離すように調整
            const newDistance = Math.max(CAMERA_COLLISION_OFFSET, closestDistance - CAMERA_COLLISION_OFFSET * 0.5);
            collisionCorrectedCameraPosition = idealCameraTargetPosition.clone().addScaledVector(directionFromTargetToCam, newDistance);
        }

    } else if (controls) {
        controls.update();
        calculatedCameraPosition = camera.position.clone();
    } else {
        calculatedCameraPosition = camera.position.clone(); // フォールバック
    }

    // --- 最終的なメインカメラ位置を決定し、lerpで適用 ---
    let finalMainCameraPositionTarget = collisionCorrectedCameraPosition !== null ? collisionCorrectedCameraPosition : calculatedCameraPosition;
    camera.position.lerp(finalMainCameraPositionTarget, CAMERA_CORRECTION_LERP_SPEED);

    // ターゲットを再設定し、コントロールを更新
    if(idealCameraTargetPosition) controls.target.copy(idealCameraTargetPosition); // ターゲットを追従させる
    controls.update(); // カメラ位置とターゲットをコントロールに反映させる


    // --- メインシーン描画 ---
    renderer.render(scene, camera);


    // --- ミニマップ描画 ---
    if (MINIMAP_ENABLED && minimapCamera && character.model && minimapCharacterIndicator) {
        // インジケータの位置と向きを更新
        minimapCharacterIndicator.position.x = character.model.position.x;
        minimapCharacterIndicator.position.z = character.model.position.z;
        minimapCharacterIndicator.rotation.y = character.model.rotation.y; // Y軸回転を同期

        const viewportWidth = renderer.domElement.width;
        const viewportHeight = renderer.domElement.height;
        const mapScreenX = viewportWidth - MINIMAP_SIZE_PX - MINIMAP_MARGIN_PX;
        const mapScreenY = viewportHeight - MINIMAP_SIZE_PX - MINIMAP_MARGIN_PX;

        // 現在の Scissor/Viewport 設定を保存
        const currentScissorTest = renderer.getScissorTest();
        const currentScissor = new THREE.Vector4();
        renderer.getScissor(currentScissor);
        const currentViewport = new THREE.Vector4();
        renderer.getViewport(currentViewport);

        // ミニマップ用に設定
        renderer.setScissorTest(true);
        renderer.setScissor(mapScreenX, mapScreenY, MINIMAP_SIZE_PX, MINIMAP_SIZE_PX);
        renderer.setViewport(mapScreenX, mapScreenY, MINIMAP_SIZE_PX, MINIMAP_SIZE_PX);
        renderer.clearDepth(); // 深度クリア

        renderer.render(scene, minimapCamera); // ミニマップ描画

        // 設定を元に戻す
        renderer.setScissorTest(currentScissorTest);
        renderer.setScissor(currentScissor);
        renderer.setViewport(currentViewport);
    }
}

// --- 初期化実行 ---
init();

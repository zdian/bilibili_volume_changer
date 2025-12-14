// ==UserScript==
// @name         B站音量调节器
// @namespace    http://tampermonkey.net/
// @version      1.2
// @description  根据up主自动调整bilibili视频音量
// @author       deepseek
// @match        *://*.bilibili.com/video/*
// @match        *://*.bilibili.com/bangumi/play/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        unsafeWindow
// ==/UserScript==

(function() {
    'use strict';

    const STORAGE_KEY = 'BILIBILI_UP_VOLUME_SETTINGS';
    let volumeConfig = GM_getValue(STORAGE_KEY, {});
    let currentUP = null;
    let videoElement = null;

    // 安全地等待视频元素加载
    function waitForVideo() {
        return new Promise((resolve) => {
            // 检查是否已有视频元素
            const existingVideo = document.querySelector('video');
            if (existingVideo) {
                videoElement = existingVideo;
                resolve(existingVideo);
                return;
            }

            // 监听视频元素出现
            const observer = new MutationObserver((mutations) => {
                const video = document.querySelector('video');
                if (video) {
                    videoElement = video;
                    observer.disconnect();
                    resolve(video);
                }
            });

            observer.observe(document.body, {
                childList: true,
                subtree: true
            });

            // 5秒后超时
            setTimeout(() => {
                observer.disconnect();
                resolve(null);
            }, 5000);
        });
    }

    // 获取UP主信息
    function getUPInfo() {
        try {
            // 方法1：从页面元素获取
            const selectors = [
                '.up-info .name',
                '.up-name',
                '.username',
                '.video-up-info .up-name',
                '.up-card__name',
                '.up-detail-name',
                '.bili-video-card__info--owner'
            ];

            for (const selector of selectors) {
                const element = document.querySelector(selector);
                if (element && element.textContent && element.textContent.trim()) {
                    const upName = element.textContent.trim();
                    return {
                        name: upName,
                        id: upName
                    };
                }
            }

            // 方法2：从脚本数据获取
            const scripts = document.querySelectorAll('script');
            for (const script of scripts) {
                const content = script.textContent || '';

                // 查找UP主信息
                const patterns = [
                    /"author":"([^"]+)"/,
                    /"owner":{"name":"([^"]+)"/,
                    /up主[：:]?\s*([^\s"]+)/i,
                    /投稿[：:]?\s*([^\s"]+)/i
                ];

                for (const pattern of patterns) {
                    const match = content.match(pattern);
                    if (match && match[1]) {
                        return {
                            name: match[1],
                            id: match[1]
                        };
                    }
                }
            }

            // 方法3：从URL获取
            const urlMatch = window.location.href.match(/\/video\/(BV\w+)/);
            if (urlMatch) {
                return {
                    name: '当前视频',
                    id: urlMatch[1]
                };
            }

            return null;
        } catch (e) {
            console.log('获取UP主信息失败:', e);
            return null;
        }
    }

    // 应用音量设置
    async function applyVolume() {
        if (!currentUP) return;

        const video = await waitForVideo();
        if (!video) return;

        // 应用保存的音量
        if (volumeConfig[currentUP] !== undefined) {
            const targetVolume = volumeConfig[currentUP];
            console.log(`为UP主 "${currentUP}" 应用音量: ${targetVolume}`);

            // 直接设置音量
            video.volume = targetVolume;

            // 监听音量变化防止被重置
            const originalVolume = targetVolume;
            const volumeChangeHandler = () => {
                if (Math.abs(video.volume - originalVolume) > 0.05) {
                    setTimeout(() => {
                        video.volume = originalVolume;
                    }, 100);
                }
            };

            video.addEventListener('volumechange', volumeChangeHandler);

            // 清理旧的监听器
            if (video._volumeChangeHandler) {
                video.removeEventListener('volumechange', video._volumeChangeHandler);
            }
            video._volumeChangeHandler = volumeChangeHandler;
        }
    }

    // 创建控制面板
    function createPanel() {
        // 移除旧面板
        const oldPanel = document.getElementById('bili-volume-panel');
        if (oldPanel) oldPanel.remove();

        const panel = document.createElement('div');
        panel.id = 'bili-volume-panel';
        panel.style.cssText = `
            position: fixed;
            top: 80px;
            right: 20px;
            background: rgba(20, 20, 20, 0.95);
            color: #fff;
            padding: 12px;
            border-radius: 8px;
            z-index: 10000;
            font-size: 13px;
            min-width: 200px;
            border: 1px solid #00a1d6;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            backdrop-filter: blur(10px);
        `;

        panel.innerHTML = `
            <div style="
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 10px;
                padding-bottom: 8px;
                border-bottom: 1px solid #333;
            ">
                <span style="color: #00a1d6; font-weight: 600;">🔊 音量控制</span>
                <button id="togglePanel" style="
                    background: none;
                    border: none;
                    color: #aaa;
                    cursor: pointer;
                    font-size: 18px;
                    line-height: 1;
                    padding: 0 5px;
                ">−</button>
            </div>

            <div id="upInfo" style="
                margin-bottom: 12px;
                font-size: 12px;
                padding: 6px;
                background: rgba(0, 161, 214, 0.1);
                border-radius: 4px;
                color: #aaa;
            ">检测UP主中...</div>

            <div style="margin-bottom: 15px;">
                <div style="
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 6px;
                ">
                    <span style="color: #ddd;">音量调节</span>
                    <span id="volumeDisplay" style="
                        color: #00a1d6;
                        font-weight: bold;
                        font-size: 14px;
                    ">1.0x</span>
                </div>
                <input type="range" id="volumeSlider"
                       min="0" max="2" step="0.1" value="1.0"
                       style="
                           width: 100%;
                           height: 6px;
                           background: #333;
                           border-radius: 3px;
                           outline: none;
                       ">
            </div>

            <div style="display: flex; gap: 8px;">
                <button id="saveBtn" style="
                    flex: 1;
                    background: linear-gradient(135deg, #00a1d6, #0088cc);
                    color: white;
                    border: none;
                    padding: 8px;
                    border-radius: 6px;
                    cursor: pointer;
                    font-weight: 500;
                    transition: all 0.2s;
                " onmouseover="this.style.opacity='0.9'"
                onmouseout="this.style.opacity='1'">保存设置</button>

                <button id="resetBtn" style="
                    flex: 1;
                    background: rgba(102, 102, 102, 0.7);
                    color: white;
                    border: none;
                    padding: 8px;
                    border-radius: 6px;
                    cursor: pointer;
                    font-weight: 500;
                    transition: all 0.2s;
                " onmouseover="this.style.opacity='0.9'"
                onmouseout="this.style.opacity='1'">恢复默认</button>
            </div>
        `;

        document.body.appendChild(panel);

        // 面板控制
        let isMinimized = false;
        panel.querySelector('#togglePanel').onclick = () => {
            isMinimized = !isMinimized;
            if (isMinimized) {
                panel.style.height = '40px';
                panel.style.overflow = 'hidden';
                panel.querySelector('#togglePanel').textContent = '+';
            } else {
                panel.style.height = 'auto';
                panel.style.overflow = 'visible';
                panel.querySelector('#togglePanel').textContent = '−';
            }
        };

        // 音量滑块事件
        const slider = panel.querySelector('#volumeSlider');
        const volumeDisplay = panel.querySelector('#volumeDisplay');

        slider.addEventListener('input', async function() {
            const value = parseFloat(this.value);
            volumeDisplay.textContent = value.toFixed(1) + 'x';

            // 实时调整音量
            const video = videoElement || await waitForVideo();
            if (video) {
                video.volume = value;
            }
        });

        // 保存按钮
        panel.querySelector('#saveBtn').onclick = async () => {
            if (currentUP) {
                const value = parseFloat(slider.value);
                volumeConfig[currentUP] = value;
                GM_setValue(STORAGE_KEY, volumeConfig);
                showMessage(`已保存 ${currentUP} 的音量设置`);
                await applyVolume();
            } else {
                showMessage('请等待UP主信息加载');
            }
        };

        // 重置按钮
        panel.querySelector('#resetBtn').onclick = async () => {
            const video = videoElement || await waitForVideo();
            if (video) {
                video.volume = 1.0;
                slider.value = 1.0;
                volumeDisplay.textContent = '1.0x';

                if (currentUP) {
                    delete volumeConfig[currentUP];
                    GM_setValue(STORAGE_KEY, volumeConfig);
                    showMessage(`已重置 ${currentUP} 的音量设置`);
                }
            }
        };

        // 拖拽功能
        makeDraggable(panel);
    }

    // 更新面板信息
    function updatePanel() {
        const panel = document.getElementById('bili-volume-panel');
        if (!panel) return;

        const upInfoElement = panel.querySelector('#upInfo');
        const slider = panel.querySelector('#volumeSlider');
        const volumeDisplay = panel.querySelector('#volumeDisplay');

        if (upInfoElement) {
            upInfoElement.textContent = currentUP ? `UP主: ${currentUP}` : '未检测到UP主';
        }

        if (currentUP && volumeConfig[currentUP] !== undefined) {
            const savedVolume = volumeConfig[currentUP];
            if (slider) slider.value = savedVolume;
            if (volumeDisplay) volumeDisplay.textContent = savedVolume.toFixed(1) + 'x';
        }
    }

    // 初始化
    async function init() {
        console.log('B站音量调节器初始化...');

        // 创建控制面板
        createPanel();

        // 延迟检测，确保页面加载完成
        setTimeout(async () => {
            const upInfo = getUPInfo();
            if (upInfo) {
                currentUP = upInfo.id;
                console.log('检测到UP主:', currentUP);
                updatePanel();
                await applyVolume();
            }
        }, 1500);

        // 监听页面变化
        setupPageObserver();
    }

    // 监听页面变化
    function setupPageObserver() {
        let lastPath = window.location.pathname;

        const observer = new MutationObserver(() => {
            const currentPath = window.location.pathname;
            if (currentPath !== lastPath) {
                lastPath = currentPath;
                console.log('页面变化，重新检测');

                setTimeout(async () => {
                    const upInfo = getUPInfo();
                    if (upInfo && upInfo.id !== currentUP) {
                        currentUP = upInfo.id;
                        console.log('UP主变化:', currentUP);
                        updatePanel();
                        await applyVolume();
                    }
                }, 1000);
            }
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    }

    // 显示消息
    function showMessage(text) {
        const msg = document.createElement('div');
        msg.textContent = text;
        msg.style.cssText = `
            position: fixed;
            top: 130px;
            right: 20px;
            background: #00a1d6;
            color: white;
            padding: 10px 15px;
            border-radius: 6px;
            z-index: 10001;
            font-size: 13px;
            animation: slideIn 0.3s ease;
        `;

        // 添加动画
        const style = document.createElement('style');
        style.textContent = `
            @keyframes slideIn {
                from { transform: translateX(100%); opacity: 0; }
                to { transform: translateX(0); opacity: 1; }
            }
        `;
        document.head.appendChild(style);

        document.body.appendChild(msg);

        setTimeout(() => {
            msg.remove();
            style.remove();
        }, 2000);
    }

    // 拖拽功能
    function makeDraggable(element) {
        let isDragging = false;
        let startX, startY, initialX, initialY;

        element.style.cursor = 'move';

        element.addEventListener('mousedown', (e) => {
            if (e.target.tagName === 'BUTTON' || e.target.tagName === 'INPUT') return;

            isDragging = true;
            startX = e.clientX;
            startY = e.clientY;
            initialX = element.offsetLeft;
            initialY = element.offsetTop;

            document.addEventListener('mousemove', onDrag);
            document.addEventListener('mouseup', stopDrag);
        });

        function onDrag(e) {
            if (!isDragging) return;

            const deltaX = e.clientX - startX;
            const deltaY = e.clientY - startY;

            element.style.left = (initialX + deltaX) + 'px';
            element.style.top = (initialY + deltaY) + 'px';
            element.style.right = 'auto';
        }

        function stopDrag() {
            isDragging = false;
            document.removeEventListener('mousemove', onDrag);
            document.removeEventListener('mouseup', stopDrag);
        }
    }

    // 安全启动
    function safeStart() {
        try {
            // 等待页面基本加载
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', init);
            } else {
                // 如果页面已加载，延迟初始化以确保视频元素存在
                setTimeout(init, 1000);
            }
        } catch (error) {
            console.error('音量调节器启动失败:', error);
        }
    }

    // 启动脚本
    safeStart();
})();
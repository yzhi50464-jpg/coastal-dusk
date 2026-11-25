# 原创 Blender 软装

`coastal-softgoods.blend` 是床被、翻折被头和枕头的可编辑源文件，含用于布料模拟的床垫、床架、地板碰撞代理。它不是整个海岸项目的 Blender 工程。碰撞代理不导入网页。

制作版本：本机 Blender 5.2.3 LTS。没有下载或导入第三方模型。

`build-softgoods.py` 从空场景构建网格，运行 65 帧布料模拟，加入六处有限范围的人工松褶，然后细分并增加厚度。翻折被头、枕头由独立网格造型。它会在本目录保存 `.blend` 和统计 JSON，更新上级的 `softgoods.js`。

重新生成（需在有 Blender 的电脑上执行）：

```text
blender --background --factory-startup --threads 6 --python models/build-softgoods.py
```

Blender 使用 Z 向上；导出转换为 Three.js Y 向上、床组局部坐标。导出数据以 Base64 保存 Float32 顶点/法线/UV 和 Uint32 索引，解码后仍为普通可检查的三维网格。

在原项目工作区，单文件网页可重新执行 `work/package.cjs` 打包；如果仅使用源码包，直接打开 `index.html` 即可使用更新后的 `softgoods.js`。正常观看网页不需要 Blender。
